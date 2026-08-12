const express = require('express');
const { requireUser } = require('../middleware/userAuth');
const { sendReminderNow } = require('../services/reminders');

const router = express.Router();

// POST /api/reminders/:id/send-now -> manda un recordatorio pendiente del
// usuario autenticado en este instante, sin esperar a su fecha_envio.
router.post('/:id/send-now', requireUser, async (req, res) => {
  try {
    await sendReminderNow(req.userId, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error(`[reminders] enviar ahora falló (${req.params.id}):`, err.message);
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
