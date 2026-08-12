const { supabaseAdmin } = require('../config/supabase');

/**
 * Autentica al usuario final (no al servidor) a partir del access token de
 * Supabase que el frontend reenvía en el header Authorization. A diferencia
 * de requireApiKey (un secreto compartido para llamadas servidor-a-servidor
 * como el cron), aquí necesitamos saber DE QUÉ USUARIO se trata, porque cada
 * quien tiene su propia sesión de WhatsApp.
 */
async function requireUser(req, res, next) {
  const header = req.header('authorization') || '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return res.status(401).json({ error: 'Falta el token de autenticación' });
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('activo')
    .eq('id', data.user.id)
    .maybeSingle();

  if (profileError) {
    return res.status(500).json({ error: 'No se pudo verificar la cuenta' });
  }
  if (!profile?.activo) {
    return res.status(403).json({ error: 'Cuenta inactiva: un administrador debe activarla primero' });
  }

  req.userId = data.user.id;
  next();
}

module.exports = { requireUser };
