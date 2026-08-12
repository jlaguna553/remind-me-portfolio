const express = require('express');
const { requireApiKey } = require('../middleware/auth');
const { processPendingReminders } = require('../services/reminders');

const router = express.Router();

// POST /api/cron/process-reminders
// Llamado periódicamente por GitHub Actions / cron-job.org / Upstash QStash.
router.post('/process-reminders', requireApiKey, async (req, res) => {
  try {
    const result = await processPendingReminders();
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[cron] error procesando recordatorios:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
