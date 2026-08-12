const express = require('express');
const sessionManager = require('../whatsapp/sessionManager');
const { requireUser } = require('../middleware/userAuth');
const { requireApiKey } = require('../middleware/auth');

const router = express.Router();

// GET /api/whatsapp/session/qr -> { qr } para el usuario autenticado
router.get('/session/qr', requireUser, (req, res) => {
  const qr = sessionManager.getQR(req.userId);
  if (!qr) {
    return res.status(404).json({ error: 'QR no disponible (ya conectado, aún generándose, o no iniciado)' });
  }
  res.json({ qr });
});

// GET /api/whatsapp/session/status -> estado de la sesión del usuario autenticado
router.get('/session/status', requireUser, (req, res) => {
  res.json({
    status: sessionManager.getStatus(req.userId),
    queueLength: sessionManager.getQueueLength(req.userId),
    phoneNumber: sessionManager.getPhoneNumber(req.userId),
    pairingCode: sessionManager.getPairingCode(req.userId),
  });
});

// POST /api/whatsapp/session/pairing-code { phoneNumber } -> { code }
// Alternativa al QR: WhatsApp genera un código que el usuario escribe a mano
// en su teléfono, útil si solo tiene un dispositivo para escanear el QR.
router.post('/session/pairing-code', requireUser, async (req, res) => {
  const { phoneNumber } = req.body || {};
  if (!phoneNumber) return res.status(400).json({ error: 'phoneNumber es requerido' });

  try {
    const code = await sessionManager.requestPairingCode(req.userId, phoneNumber);
    res.json({ code });
  } catch (err) {
    console.error(`[whatsapp/session/pairing-code] error (${req.userId}):`, err.message);
    res.status(500).json({ error: err.message || 'No se pudo generar el código de vinculación' });
  }
});

// GET /api/whatsapp/session/contacts -> libreta de contactos de WhatsApp del usuario
router.get('/session/contacts', requireUser, (req, res) => {
  if (sessionManager.getStatus(req.userId) !== 'connected') {
    return res.status(503).json({ error: 'WhatsApp no está conectado' });
  }
  res.json({ contacts: sessionManager.getContacts(req.userId) });
});

// POST /api/whatsapp/session/contacts/resync -> pide de nuevo la libreta de contactos
router.post('/session/contacts/resync', requireUser, async (req, res) => {
  try {
    await sessionManager.resyncContacts(req.userId);
    res.json({ ok: true });
  } catch (err) {
    console.error(`[whatsapp/session/contacts/resync] error (${req.userId}):`, err.message);
    res.status(500).json({ error: 'No se pudo sincronizar la libreta de contactos' });
  }
});

// GET /api/whatsapp/session/groups -> grupos de WhatsApp en los que participa el usuario
router.get('/session/groups', requireUser, async (req, res) => {
  try {
    const groups = await sessionManager.getGroups(req.userId);
    res.json({ groups });
  } catch (err) {
    console.error(`[whatsapp/session/groups] error (${req.userId}):`, err.message);
    res.status(503).json({ error: 'No se pudieron obtener los grupos (¿WhatsApp está conectado?)' });
  }
});

// POST /api/whatsapp/session/connect -> inicia (o reintenta) la sesión del usuario
router.post('/session/connect', requireUser, async (req, res) => {
  try {
    await sessionManager.startSession(req.userId);
    res.json({ status: sessionManager.getStatus(req.userId) });
  } catch (err) {
    console.error(`[whatsapp/session/connect] error (${req.userId}):`, err.message);
    res.status(500).json({ error: 'No se pudo iniciar la sesión de WhatsApp' });
  }
});

// POST /api/whatsapp/session/logout -> desvincula el número del usuario
router.post('/session/logout', requireUser, async (req, res) => {
  await sessionManager.logoutSession(req.userId);
  res.json({ ok: true });
});

// POST /api/whatsapp/send { userId, phone, message } -> uso servidor-a-servidor
// (pruebas manuales), protegido por x-api-key en vez de sesión de usuario.
router.post('/send', requireApiKey, async (req, res) => {
  const { userId, phone, message } = req.body || {};

  if (!userId || !phone || !message) {
    return res.status(400).json({ error: 'userId, phone y message son requeridos' });
  }
  if (sessionManager.getStatus(userId) !== 'connected') {
    return res.status(503).json({ error: 'La sesión de WhatsApp de ese usuario no está conectada' });
  }

  const jid = await sessionManager.resolveJid(userId, phone);
  if (!jid) {
    return res.status(422).json({ error: 'El número no tiene WhatsApp o el formato es incorrecto' });
  }

  sessionManager.enqueueMessage(userId, jid, { text: message }, (err) => {
    if (err) console.error('[whatsapp/send] error de envío:', err.message);
  });

  res.status(202).json({ queued: true, queueLength: sessionManager.getQueueLength(userId) });
});

module.exports = router;
