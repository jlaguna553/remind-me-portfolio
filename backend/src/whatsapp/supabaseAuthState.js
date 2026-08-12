const { supabaseAdmin } = require('../config/supabase');
const { loadBaileys } = require('./loadBaileys');

const TABLE = 'wa_sessions';

async function readData(sessionId, keyId) {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select('data')
    .eq('session_id', sessionId)
    .eq('key_id', keyId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  // Los Buffer (claves criptográficas) se serializan como JSON plano;
  // BufferJSON.reviver los reconstruye a su tipo original.
  const { BufferJSON } = await loadBaileys();
  return JSON.parse(JSON.stringify(data.data), BufferJSON.reviver);
}

async function writeData(sessionId, keyId, value) {
  const { BufferJSON } = await loadBaileys();
  const serialized = JSON.parse(JSON.stringify(value, BufferJSON.replacer));
  const { error } = await supabaseAdmin
    .from(TABLE)
    .upsert(
      { session_id: sessionId, key_id: keyId, data: serialized, updated_at: new Date().toISOString() },
      { onConflict: 'session_id,key_id' }
    );
  if (error) throw error;
}

async function removeData(sessionId, keyId) {
  const { error } = await supabaseAdmin
    .from(TABLE)
    .delete()
    .eq('session_id', sessionId)
    .eq('key_id', keyId);
  if (error) throw error;
}

/**
 * Reimplementa la interfaz de useMultiFileAuthState de Baileys pero
 * persistiendo cada "archivo" como una fila en Supabase (tabla wa_sessions)
 * en lugar del filesystem. Así, cuando el contenedor de Render/Fly duerme
 * o se redeploya, el backend recupera la sesión sin volver a pedir QR.
 */
async function useSupabaseAuthState(sessionId) {
  const { initAuthCreds } = await loadBaileys();
  const storedCreds = await readData(sessionId, 'creds');
  const creds = storedCreds || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(sessionId, `${type}-${id}`);
              if (type === 'app-state-sync-key' && value) {
                const { proto } = await loadBaileys();
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              data[id] = value;
            })
          );
          return data;
        },
        set: async (data) => {
          const tasks = [];
          for (const category of Object.keys(data)) {
            for (const id of Object.keys(data[category])) {
              const value = data[category][id];
              const keyId = `${category}-${id}`;
              tasks.push(value ? writeData(sessionId, keyId, value) : removeData(sessionId, keyId));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: () => writeData(sessionId, 'creds', creds),
    clearCreds: async () => {
      const { error } = await supabaseAdmin.from(TABLE).delete().eq('session_id', sessionId);
      if (error) throw error;
    },
  };
}

module.exports = { useSupabaseAuthState };
