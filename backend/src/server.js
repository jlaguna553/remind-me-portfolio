require('dotenv').config();

// Baileys/libsignal a veces lanzan (o rechazan una promesa) desde su propio
// código interno — ej. una query de mantenimiento de sesión que sigue en
// vuelo justo cuando el WebSocket ya se cerró (Boom "Connection Closed"), o
// un fallo de descifrado de libsignal — fuera de cualquier try/catch al que
// nuestro código tenga acceso. Por defecto Node mata el proceso entero ante
// esto. Como este proceso sirve el socket de WhatsApp de TODOS los usuarios
// a la vez (sessionManager.js), dejar que eso derribe el proceso apaga a
// todo el mundo por un problema de un solo número. La sesión afectada de
// todos modos se recupera sola: cuando su WebSocket se cierra de verdad,
// dispara el 'connection.update' de tipo 'close' que ya maneja la
// reconexión (ver attachHandlers en sessionManager.js).
process.on('uncaughtException', (err) => {
  console.error('[server] uncaughtException (proceso sigue vivo):', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[server] unhandledRejection (proceso sigue vivo):', reason);
});

const express = require('express');
const cors = require('cors');
const whatsappRoutes = require('./routes/whatsapp');
const cronRoutes = require('./routes/cron');
const remindersRoutes = require('./routes/reminders');
const sessionManager = require('./whatsapp/sessionManager');
const { processPendingReminders } = require('./services/reminders');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => res.json({ ok: true, service: 'reminders-whatsapp-backend' }));
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/cron', cronRoutes);
app.use('/api/reminders', remindersRoutes);

const PORT = process.env.PORT || 3000;
const INTERNAL_CRON_INTERVAL_MS = 60_000;

// Reconecta solo a los usuarios que ya habían vinculado su WhatsApp antes
// (ver sessionManager.bootstrapExistingSessions). Los usuarios nuevos inician
// su propia sesión bajo demanda desde /api/whatsapp/session/connect.
sessionManager.bootstrapExistingSessions().catch((err) => console.error('No se pudieron recuperar sesiones:', err));

app.listen(PORT, () => console.log(`Backend escuchando en el puerto ${PORT}`));

// Scheduler interno: cubre el caso local (sin GitHub Actions corriendo) y
// reduce la latencia en producción entre corridas del cron externo mientras
// el proceso siga despierto. El cron externo (GitHub Actions/cron-job.org)
// sigue siendo necesario para *despertar* el backend cuando Render/Fly lo
// duerme por inactividad, ya que un setInterval no corre con el proceso dormido.
setInterval(() => {
  processPendingReminders().catch((err) => console.error('[cron interno] error:', err));
}, INTERNAL_CRON_INTERVAL_MS);
