// @whiskeysockets/baileys 7.x es un paquete ESM puro ("type": "module" en su
// package.json, sin build para CommonJS) — y este backend entero es
// CommonJS. `require('@whiskeysockets/baileys')` lanzaría ERR_REQUIRE_ESM.
// `import()` dinámico sí funciona para cargar un paquete ESM desde
// CommonJS (a diferencia de `require`, no es sensible al "type" del
// paquete de destino), pero devuelve una Promise, así que cualquier código
// que necesite algo de Baileys (makeWASocket, DisconnectReason, proto,
// etc.) tiene que hacerlo desde una función async.
//
// Se cachea en una sola promesa a nivel de módulo, compartida por
// sessionManager.js y supabaseAuthState.js, para no evaluar el import()
// por separado en cada archivo (Node ya cachea el módulo resuelto
// internamente, pero así queda un solo punto de carga explícito).
let baileysPromise = null;

function loadBaileys() {
  if (!baileysPromise) baileysPromise = import('@whiskeysockets/baileys');
  return baileysPromise;
}

module.exports = { loadBaileys };
