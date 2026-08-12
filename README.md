# Reminders App — Recordatorios por WhatsApp (infraestructura 100% gratuita)

![Next.js](https://img.shields.io/badge/Next.js%2014-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind%20CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white)
![Baileys](https://img.shields.io/badge/Baileys%20(WhatsApp)-25D366?style=for-the-badge&logo=whatsapp&logoColor=white)
![License](https://img.shields.io/badge/Licencia-MIT-green?style=for-the-badge)

> **SaaS de recordatorios por WhatsApp multi-usuario, con cola anti-ban, confirmación de entrega real y despliegue 100% free tier.**

Sistema de administración de recordatorios enviados por WhatsApp, construido para correr
enteramente en capas gratuitas: **Supabase** (DB + Auth), **Render/Fly.io** (backend de
mensajería) y **Vercel** (PWA). El envío usa **Baileys** (emulación de WhatsApp Web vía
protocolo Signal, sin Chromium) en lugar de `whatsapp-web.js`/Puppeteer, porque Puppeteer
por sí solo consume 200-300MB de RAM en reposo — inviable en un contenedor de 512MB junto
con Node y el resto del proceso.

```
remind-me/
├── supabase/schema.sql        # Tablas + RLS + tabla de sesión de Baileys
├── backend/                   # Node/Express + Baileys (Render o Fly.io)
├── frontend/                  # Next.js App Router (PWA, instalable) — Vercel
└── .github/workflows/         # Cron gratuito vía GitHub Actions
```

## 1. Modelo de datos (Supabase)

1. Crea un proyecto en [supabase.com](https://supabase.com) (plan Free).
2. Abre el SQL Editor y ejecuta, en orden:
   - [`supabase/schema.sql`](supabase/schema.sql)
   - [`supabase/002_admin_profiles.sql`](supabase/002_admin_profiles.sql)
   - [`supabase/003_recordatorios_recurrentes.sql`](supabase/003_recordatorios_recurrentes.sql)
   - [`supabase/004_usuarios_inactivos_por_defecto.sql`](supabase/004_usuarios_inactivos_por_defecto.sql)
   - [`supabase/005_categoria_contactos.sql`](supabase/005_categoria_contactos.sql)
   - [`supabase/006_grupos_whatsapp.sql`](supabase/006_grupos_whatsapp.sql)
   - [`supabase/007_plantillas_y_adjuntos.sql`](supabase/007_plantillas_y_adjuntos.sql)
   - [`supabase/008_quitar_stickers.sql`](supabase/008_quitar_stickers.sql)
   - [`supabase/009_multiples_imagenes.sql`](supabase/009_multiples_imagenes.sql)
   - [`supabase/010_pausar_recordatorios.sql`](supabase/010_pausar_recordatorios.sql)
   - [`supabase/011_realtime_recordatorios.sql`](supabase/011_realtime_recordatorios.sql)
   - [`supabase/012_zona_horaria.sql`](supabase/012_zona_horaria.sql)
   - [`supabase/013_dias_permitidos_recurrente.sql`](supabase/013_dias_permitidos_recurrente.sql)
   - [`supabase/014_pausado_hasta.sql`](supabase/014_pausado_hasta.sql)
   - [`supabase/015_pausado_por_desconexion.sql`](supabase/015_pausado_por_desconexion.sql)

Esto crea:

- **`clientes`**: `id, user_id, nombre, telefono, metadata, timestamps`.
- **`recordatorios`**: `id, user_id, cliente_id, mensaje_plantilla, fecha_envio, estado, intentos, error`.
  - `estado` es un enum: `pendiente → en_proceso → enviado | fallido`. El estado intermedio
    `en_proceso` existe porque la cola anti-ban tarda 30-60s por mensaje; sin él, dos
    corridas de cron consecutivas podrían encolar el mismo recordatorio dos veces.
  - `pausado` (migración `010_pausar_recordatorios.sql`) es un quinto valor del enum: un
    recordatorio pausado conserva toda su configuración pero `processPendingReminders()` lo
    ignora (solo mira `estado = 'pendiente'`), sin necesidad de tocar esa consulta. Ver
    sección 4.6 para cuándo y cómo se pausa/reanuda.
  - **Realtime** (migración `011_realtime_recordatorios.sql`): agrega la tabla a la
    publicación `supabase_realtime`, para que el frontend reciba los cambios (`estado`, sobre
    todo) al instante en vez de tener que refrescar la página. Ver sección 4.6.
- **RLS**: policies `auth.uid() = user_id` en ambas tablas — cada usuario autenticado solo
  ve y modifica sus propios registros.
- **`wa_sessions`**: guarda las credenciales de Baileys (ver sección 5). RLS activo **sin
  policies**, por lo que solo la `service_role key` (usada exclusivamente en el backend)
  puede leer/escribir ahí.
- **`profiles`** (migración `002_admin_profiles.sql`): espejo público de `auth.users` con
  `activo` e `is_admin`, creado automáticamente por un trigger cada vez que alguien se
  registra. Ver sección 4.1 para el módulo de administración que usa esta tabla.
- **Columnas de recurrencia en `recordatorios`** (migración `003_recordatorios_recurrentes.sql`):
  `es_recurrente`, `frecuencia` (enum `diaria|semanal|mensual|personalizada`),
  `intervalo_dias`, `fecha_fin`, `ultimo_envio`. Ver sección 4.2.
- **Aprobación de cuentas nuevas** (migración `004_usuarios_inactivos_por_defecto.sql`): cambia
  el default de `profiles.activo` a `false`, así que cualquiera que se registre queda
  bloqueado hasta que un admin lo active desde `/admin`. También agrega `is_active()`
  (security definer, simétrica a `is_admin()`) y la usa para exigir `activo = true` en las
  policies de `insert` de `clientes` y `recordatorios` — la restricción vive en la base de
  datos, no solo en la UI. Ver sección 4.1.
- **`categoria` en `clientes`** (migración `005_categoria_contactos.sql`): columna de texto
  libre, opcional, para que cada usuario etiquete a sus contactos como quiera (ej. "Cliente
  frecuente", "Proveedor"). Ver sección 4.4.
- **`es_grupo` en `clientes`** (migración `006_grupos_whatsapp.sql`): un grupo de WhatsApp
  importado se guarda como una fila más de `clientes`, reutilizando el mismo flujo de agendado
  — cuando `es_grupo = true`, la columna `telefono` guarda el JID del grupo (termina en
  `@g.us`) en vez de un número en formato E.164. Ver sección 4.4.
- **`plantillas`** (migración `007_plantillas_y_adjuntos.sql`), más el bucket público de
  Storage `attachments`. La migración `008_quitar_stickers.sql` borra la columna
  `sticker_url` que esa migración también creaba — se decidió no ofrecer stickers, solo
  imágenes. La migración `009_multiples_imagenes.sql` reemplaza la columna `imagen_url` (una
  sola) por `imagenes_urls text[]` en `recordatorios` y `plantillas`, para poder adjuntar
  varias imágenes a un mismo mensaje. Ver sección 4.5.

> **Nota de nomenclatura**: la tabla sigue llamándose `clientes` (y `recordatorios.cliente_id`
> sigue siendo esa columna) aunque en la interfaz el módulo ahora se llama "Contactos" — el
> renombrado fue deliberadamente solo de cara al usuario (rutas, textos) para no arriesgar una
> migración de esquema con datos reales ya en producción. Ver sección 4.4 para el detalle.

Copia del panel de Supabase (Settings → API): `Project URL`, `anon public key` y
`service_role key` (esta última nunca va al frontend).

## 2. Backend de mensajería (`backend/`)

Stack: Express + [`@whiskeysockets/baileys`](https://github.com/WhiskeySockets/Baileys) (fork
mantenido de Baileys) + `@supabase/supabase-js`.

> **⚠️ `@whiskeysockets/baileys` está pinneado a `7.0.0-rc13`, una versión release-candidate,
> no estable.** Se subió desde `6.7.x` deliberadamente para poder mandar varias imágenes
> agrupadas en un álbum real de WhatsApp (sección 4.5) — esa función no existe en ningún
> `6.x` publicado. Es un salto de dos versiones mayores con reescritura interna completa, y
> **la validación contra una sesión real de WhatsApp queda pendiente de producción** (no hay
> forma de autenticar un número de WhatsApp real en un entorno de CI). Lo que sí se verificó
> (comparando el código fuente instalado de `6.7.23` contra `7.0.0-rc13`, y con un smoke test
> real de `import()` cargando el paquete) fue que cada API que este backend usa —
> `makeWASocket`, `DisconnectReason` (incluyendo `loggedOut`), `fetchLatestBaileysVersion`,
> `ALL_WA_PATCH_NAMES`, `proto.WebMessageInfo.Status` (incluyendo `DELIVERY_ACK`),
> `initAuthCreds`, `BufferJSON`, la forma de `ConnectionState`, y los nombres de los eventos
> (`connection.update`, `creds.update`, `contacts.upsert/update`, `messages.update`) — sigue
> existiendo con la misma forma. Eso reduce el riesgo, pero **no reemplaza probarlo con una
> cuenta real después de desplegar** — hazlo con cuidado y vigila los logs del primer
> deploy. Si algo sale mal, la opción más simple es volver a fijar la dependencia a
> `^6.7.9` (se pierde el álbum real; las imágenes se manden como mensajes separados) y
> revertir `src/whatsapp/loadBaileys.js` (ver más abajo) a un `require()` normal.
>
> **Por qué esto también obligó a reestructurar cómo se importa Baileys**: `7.x` es un
> paquete ESM puro (`"type": "module"` en su `package.json`, sin build para CommonJS), y este
> backend entero es CommonJS. `require('@whiskeysockets/baileys')` lanzaría
> `ERR_REQUIRE_ESM`. En vez de convertir todo el backend a ESM (cambio mucho más invasivo,
> tocando cada archivo), [`src/whatsapp/loadBaileys.js`](backend/src/whatsapp/loadBaileys.js)
> expone un solo `loadBaileys()` que hace `import()` dinámico (sí funciona desde CommonJS,
> a diferencia de `require`) y cachea la promesa — los únicos dos archivos que tocan Baileys
> directamente, [`sessionManager.js`](backend/src/whatsapp/sessionManager.js) y
> [`supabaseAuthState.js`](backend/src/whatsapp/supabaseAuthState.js), ahora hacen
> `const { X } = await loadBaileys();` al principio de cada función que necesita algo del
> paquete, en vez del `require()` síncrono de nivel de módulo que tenían antes. El resto del
> backend (rutas, middlewares, `server.js`) no toca Baileys y se quedó exactamente igual.

```bash
cd backend
cp .env.example .env   # completa SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, API_KEY
npm install
npm run dev
```

**Cada usuario tiene su propio número de WhatsApp** — no existe una sesión global compartida.
`src/whatsapp/sessionManager.js` mantiene un `Map<userId, sesión>` con un socket de Baileys
independiente por usuario (su propio estado de conexión/QR y su propia cola anti-ban). Al
arrancar, `bootstrapExistingSessions()` reconecta solo a los usuarios que **ya habían vinculado**
su WhatsApp antes (tienen credenciales guardadas en `wa_sessions`); un usuario nuevo inicia su
sesión bajo demanda desde la UI (`WhatsAppStatus.tsx` → "Conectar WhatsApp"), generando su
propio QR.

> **⚠️ Sesiones recién vinculadas y números sin historial de chat**: WhatsApp aplica
> heurísticas anti-spam agresivas a dispositivos vinculados hace poco, sobre todo al enviar
> a números que nunca han tenido una conversación con esa cuenta. El envío puede "aceptarse"
> a nivel de protocolo (Baileys no lanza error, `sock.sendMessage` resuelve bien) pero
> WhatsApp lo descarta silenciosamente sin avisar al remitente. Esto es una limitación de
> WhatsApp, no un bug de este backend. Para evitarlo: (1) tras vincular una sesión nueva,
> abre manualmente un chat desde el teléfono con cada número de prueba y salúdalo antes de
> automatizar envíos hacia él; (2) evita ráfagas de números nuevos sin contacto previo en
> las primeras 24h de una sesión; (3) `resolveJid()` (`src/whatsapp/sessionManager.js`) valida
> que el número exista en WhatsApp antes de enviar, pero no puede detectar este bloqueo
> silencioso — solo confirma que el número es válido.

> **⚠️ Límite real de escalabilidad en 512MB**: cada usuario conectado mantiene su propio
> socket de Baileys vivo en memoria. Unos cuantos usuarios activos funcionan bien en el plan
> free de Render; decenas o cientos de sesiones simultáneas probablemente agoten los 512MB y
> tumben el proceso. Si el negocio crece a ese punto, considera: repartir usuarios entre
> varias instancias del backend (ej. por rango de `user_id`), migrar a un plan pagado con más
> RAM, o evaluar Evolution API (pensado para multi-sesión a mayor escala).

### Endpoints

| Endpoint | Método | Auth | Descripción |
|---|---|---|---|
| `/api/whatsapp/session/qr` | GET | JWT de usuario | QR actual del usuario autenticado, o 404 si no aplica |
| `/api/whatsapp/session/status` | GET | JWT de usuario | `{ status: disconnected\|connecting\|qr\|connected, queueLength, phoneNumber }` |
| `/api/whatsapp/session/contacts` | GET | JWT de usuario | Libreta de contactos de WhatsApp del usuario (para importar), 503 si no está conectado |
| `/api/whatsapp/session/groups` | GET | JWT de usuario | Grupos de WhatsApp del usuario (`groupFetchAllParticipating()`), para importar |
| `/api/whatsapp/session/contacts/resync` | POST | JWT de usuario | Fuerza una resincronización de contactos con WhatsApp (ver sección 4.4) |
| `/api/whatsapp/session/connect` | POST | JWT de usuario | Inicia (o reintenta) la sesión de WhatsApp de ese usuario |
| `/api/whatsapp/session/logout` | POST | JWT de usuario | Desvincula el número (borra credenciales, permite escanear uno nuevo) |
| `/api/whatsapp/send` | POST | `x-api-key` | `{ userId, phone, message }` → uso servidor-a-servidor / pruebas manuales |
| `/api/cron/process-reminders` | POST | `x-api-key` | Dispara el barrido de recordatorios pendientes (sección 3) |

Los endpoints `session/*` los llama el frontend (nunca directo desde el navegador, ver
sección 4) y se autentican con el **access token de Supabase del usuario en sesión**, validado
en `src/middleware/userAuth.js` (`supabaseAdmin.auth.getUser(token)` + chequeo de
`profiles.activo`). Los endpoints `send` y `cron` son servidor-a-servidor y siguen usando el
secreto compartido `x-api-key` (`src/middleware/auth.js`), como antes.

### Cola anti-ban por usuario (`src/whatsapp/sessionManager.js`)

Cada sesión tiene su **propio** arreglo en memoria procesado secuencialmente, con un
`setTimeout` aleatorio de **30-60 segundos entre cada envío** — igual que antes, pero ahora
aislado por usuario en vez de una sola cola global. Esto es más correcto que compartir una
cola: el riesgo de baneo por comportamiento de bot es por número de WhatsApp, no del sistema
en conjunto, así que los envíos de un usuario no deberían hacer esperar a los de otro. Al ser
en memoria, si el proceso se reinicia la cola se pierde — aceptable aquí porque el cron
(sección 3) siempre vuelve a encontrar los recordatorios que quedaron en `pendiente`/`en_proceso`
sin enviar y los reintenta.

### Confirmación de entrega, no solo de envío

`sock.sendMessage()` de Baileys resuelve en cuanto **WhatsApp acepta el mensaje**, no cuando
lo entrega de verdad — así que un envío que WhatsApp descarta en silencio (el mismo bloqueo
anti-spam ya documentado para sesiones/números nuevos) se veía, desde el código, exactamente
igual que un envío exitoso. En un recordatorio recurrente esto era especialmente confuso: se
reprogramaba solo al día siguiente sin haber llegado nunca, sin dejar ningún error visible.

`sendAndConfirmDelivery()` en `sessionManager.js` espera hasta 25 segundos a que llegue un
`DELIVERY_ACK` (el **destinatario** recibió el mensaje, no solo el servidor de WhatsApp) por
el evento `messages.update`, usando el `id` del mensaje que devuelve `sendMessage()`. Si no
llega a tiempo, o si WhatsApp reporta `ERROR`, se trata como un fallo real:

- Un recordatorio **único**: se marca `fallido` como antes.
- Un recordatorio **recurrente**: un solo fallo ya no mata la serie completa —
  `markFallidoRecurrenteYReprogramar()` (en [`reminders.js`](backend/src/services/reminders.js))
  igual lo reprograma para el siguiente ciclo, pero deja el mensaje de error visible en la
  fila (se limpia solo hasta el próximo envío que sí se confirme) para que quede un rastro de
  que algo falló sin detener los envíos futuros.

**Por qué `DELIVERY_ACK` y no `SERVER_ACK`**: la primera versión de este chequeo esperaba
`SERVER_ACK` (WhatsApp confirmó que *recibió* el mensaje), pero eso resultó insuficiente en la
práctica — un mensaje bloqueado en silencio por el anti-spam de WhatsApp puede recibir
`SERVER_ACK` igual, camino a descartarse antes de llegar al destinatario. `DELIVERY_ACK`
confirma que el destinatario sí lo recibió.

**Excepción — mensajes a uno mismo ("nota a mí")**: si el número destino es el mismo número
de la sesión conectada, `sendAndConfirmDelivery()` no espera ningún ACK — no hay "otra parte"
que genere un `DELIVERY_ACK` normal en ese caso, así que se confía directamente en que
`sendMessage()` no haya lanzado error. Esto importa para pruebas: agendar un recordatorio a tu
propio número (una forma común de probar la app) antes se podía marcar como fallido sin
razón real, porque nunca iba a llegar el ACK que se estaba esperando.

**Excepción — grupos**: se observó en producción un recordatorio a un grupo que sí llegó de
verdad (confirmado visualmente por el usuario) pero cuyo `messages.update` nunca alcanzó
`DELIVERY_ACK` antes de los 25s, así que se marcó `fallido` sin haber fallado. A diferencia de
un chat 1:1, un grupo no tiene un único "entregado" — depende de cada participante por
separado — así que no hay un `DELIVERY_ACK` limpio y único que esperar. Ahora, igual que con el
autoenvío, un JID de grupo (termina en `@g.us`) tampoco espera ningún ACK. Esto además arregla
un segundo síntoma del mismo bug: como este falso "fallido" ocurría en la **primera** imagen de
un recordatorio con varias, `processQueue()` (sección de arriba) nunca llegaba a mandar las
demás — el `throw` del timeout cortaba el `try` antes del `for` que las manda. Al no lanzar más
para grupos, el resto de las imágenes ahora sí se encolan.

La validación contra sesión real no fue exhaustiva en esta iteración: el primer intento
(`SERVER_ACK`, 15s) se probó en producción y no fue suficiente; el ajuste a `DELIVERY_ACK`
(25s) más la excepción de autoenvío tampoco cubría el caso de grupos, que se descubrió después
con otro reporte en producción — es la corrección más reciente a ese hallazgo, pero conviene
seguir vigilándolo: un destinatario 1:1 real que esté offline por más de 25s también haría que
su recordatorio se marque como fallido aunque WhatsApp sí lo entregue después, apenas se
reconecte.

### Resiliencia del proceso ante errores internos de Baileys/libsignal

En un deploy de Render se observó que el proceso completo moría (`Exited with status 1`,
Render lo reiniciaba solo) tras una racha de errores `Bad MAC` (libsignal no pudo descifrar un
mensaje entrante con ninguna sesión conocida — típico de una sesión de Signal desincronizada,
ej. por la ventana en la que el contenedor viejo y el nuevo de un redeploy estuvieron ambos
brevemente conectados con las mismas credenciales) seguidos de un `Error: Connection Closed`
(Boom 428) lanzado desde **dentro de Baileys** (`sendPassiveIq` intentando mandar una query justo
cuando el WebSocket ya se había cerrado). Ese throw ocurre en código interno de la librería, sin
ningún `try/catch` nuestro en el medio — Node, por defecto, mata el proceso entero ante una
excepción no atrapada.

El problema de fondo es que **un solo proceso sirve el socket de WhatsApp de todos los
usuarios** (`sessionManager.js`): dejar que un fallo interno de la sesión de un usuario tumbe el
proceso corta también a todos los demás. `server.js` ahora registra `process.on('uncaughtException')`
y `process.on('unhandledRejection')` a nivel global — deliberadamente **no** vuelven a lanzar ni
hacen `process.exit()`, solo registran el error y dejan el proceso vivo. La sesión afectada de
todos modos se recupera sola: en cuanto su WebSocket se cierra de verdad, dispara el evento
`connection.update` de tipo `close` que ya maneja la reconexión (sección "Cola anti-ban" más
arriba); no hace falta reiniciar el proceso completo para eso.

Los `Bad MAC` en sí (antes del crash) probablemente eran ruido esperado durante la ventana de
solape del redeploy y no requieren una corrección propia — si vuelven a aparecer de forma
sostenida **fuera** de una ventana de deploy, es señal de una sesión de Signal realmente
corrupta para ese usuario, y la solución es desvincular y volver a escanear el QR
(`POST /session/logout` + reconectar), no algo que el código pueda arreglar solo.

### Libreta de contactos de WhatsApp (para importar)

Cada entrada de sesión guarda un `Map<jid, { name }>` de contactos, poblado por los eventos
`contacts.upsert`/`contacts.update` de Baileys (altas y cambios de nombre). `getContacts(userId)`
filtra grupos/broadcasts (solo deja JIDs de `@s.whatsapp.net` con puros dígitos) y devuelve
`{ phone, name }` ordenado por nombre.

**Por qué los contactos costaron mucho más que los grupos**: los grupos se obtienen con
`sock.groupFetchAllParticipating()` — una consulta directa que siempre trae la lista real, sin
depender de nada más. Los contactos, en cambio, dependen de Baileys sincronizando el
"app-state" de WhatsApp (el mismo mecanismo que sincroniza chats archivados, mutes, etc.). Se
investigaron y corrigieron dos bugs reales en esa ruta:

1. **`contacts.set` no existe** en la versión de Baileys usada (`@whiskeysockets/baileys`
   6.7.x) — nuestro código escuchaba ese evento para la carga inicial completa, pero Baileys
   nunca lo emite; solo emite `contacts.upsert`/`contacts.update`, que son incrementales. El
   listener a `contacts.set` se quitó por ser código muerto.
2. **`syncFullHistory: false` sí apaga la sincronización automática de contactos**, no solo la
   de mensajes como se pensaba originalmente: Baileys decide si pedir el snapshot inicial de
   contactos mirando `shouldSyncHistoryMessage`, que por defecto es `() => !!syncFullHistory`
   (`Socket/index.js`) — con `syncFullHistory: false` (elegido a propósito por memoria, sección
   siguiente) esa función siempre da `false`, así que el snapshot automático nunca se pide.

El botón "Sincronizar contactos" (`POST /session/contacts/resync` →
`sessionManager.resyncContacts()`) ya existía para forzar ese snapshot a mano con
`sock.resyncAppState(ALL_WA_PATCH_NAMES, false)`, pero tenía un tercer bug que lo volvía un
no-op después del primer uso: Baileys decide si pedir un snapshot completo o solo los cambios
("patches") desde la última vez mirando un número de versión que persiste en `wa_sessions`
(sobrevive a un redeploy), mientras que el `Map` en memoria de contactos **no** sobrevive. Tras
cualquier reinicio del proceso, un resync "normal" veía una versión ya avanzada, pedía solo
deltas, WhatsApp no tenía nada nuevo que reportar, y la lista se quedaba vacía para siempre.
`resyncContacts()` ahora borra las versiones guardadas de las 5 colecciones
(`ALL_WA_PATCH_NAMES`) antes de resincronizar, forzando un snapshot completo real cada vez.

En el frontend, [`ContactosSection.tsx`](frontend/src/components/contactos/ContactosSection.tsx)
ya no depende de que el usuario encuentre el botón de sincronizar: `fetchContacts()` ahora
devuelve la lista obtenida, y si viene vacía al abrir/cambiar a la pestaña de contactos,
automáticamente se escala a `resyncContacts()` (forzado) — el mismo "simplemente funciona" que
ya tenían los grupos, sin gastar el resync completo en cada apertura cuando los contactos ya
están cargados en memoria.

### Huella de memoria (contenedores de 512MB)

- `npm start` corre con `node --max-old-space-size=350` (antes 460 — ver el bug real que causó
  bajarlo, justo abajo) para dejar margen al resto del proceso.
  > **Bug real encontrado en producción**: con `--max-old-space-size=460` en un contenedor de
  > 512MB, Render mataba el proceso a media vinculación de WhatsApp con "Ran out of memory (used
  > over 512MB)" — visible en la pestaña **Events** del dashboard de Render, no en los logs de la
  > app (un OOM kill del sistema operativo es un `SIGKILL` silencioso: no hay excepción de
  > JavaScript que capturar, ni con los manejadores de `uncaughtException`/`unhandledRejection`
  > de `server.js`, porque el proceso completo muere de golpe antes de poder loguear nada). El
  > frontend, mientras tanto, se quedaba mostrando "Cargando estado..." para siempre — ni
  > recargar la página lo arreglaba, porque el backend seguía cayéndose en un ciclo mientras el
  > estado en memoria (`sessions`, sección 5) se perdía en cada reinicio. `460` de 512MB solo deja
  > 52MB de margen para todo lo que V8 NO cuenta dentro de `--max-old-space-size` (new space,
  > buffers externos de las operaciones de cifrado/protobuf que hace Baileys al establecer una
  > sesión nueva, el propio runtime de Node, threads de `libuv`) — insuficiente para el pico de
  > memoria de una vinculación real. Bajarlo dejaba de facto muy poco colchón real; `350` deja
  > ~160MB de margen, suficiente para que el recolector de basura de V8 actúe *antes* de tocar el
  > límite duro del contenedor, en vez de que el sistema operativo mate el proceso sin aviso. Si
  > vas a tener muchos usuarios vinculando WhatsApp al mismo tiempo seguido, considera subir de
  > plan en Render (más RAM) en vez de bajar aún más este número.
- Baileys usa el protocolo Signal directamente (sin navegador embebido).
- `logger: pino({ level: 'silent' })`, `printQRInTerminal: false`.
- `syncFullHistory: false`, `markOnlineOnConnect: false`, `generateHighQualityLinkPreview: false`
  evitan que Baileys descargue/mantenga en memoria el historial completo de chats.
- El bootstrap al arrancar solo reconecta usuarios que ya tenían sesión guardada; nadie más
  consume memoria hasta que decide vincular su WhatsApp (ver advertencia de escalabilidad
  arriba).

### Despliegue gratuito

- **Render (Web Service, plan Free)**: build command `npm install`, start command `npm start`.
  Nota: el plan free "duerme" tras 15 min sin tráfico. El siguiente request tarda ~30-50s en
  responder (cold start) — por eso el workflow de cron usa `--max-time 60`.
- **Fly.io**: similar, usando `fly launch` con `[http_service] auto_stop_machines = true`.
  Fly ofrece un volumen persistente gratuito pequeño, pero **no lo necesitas** porque la
  sesión vive en Supabase (sección 5), no en disco.

## 3. Servicio de programación (cron)

`src/services/reminders.js` implementa `processPendingReminders()`:

1. Selecciona hasta 50 filas de `recordatorios` con `estado = 'pendiente'` y
   `fecha_envio <= now()` (excluyendo usuarios desactivados, sección 4.1).
2. De esas, se queda solo con las cuyo **dueño (`user_id`) tiene su WhatsApp conectado en
   este momento** (`sessionManager.getStatus(user_id) === 'connected'`) — las demás se dejan
   intactas en `pendiente` para reintentarlas en el siguiente ciclo, sin marcarlas como fallidas.
3. Las que sí se van a procesar se marcan en bloque como `en_proceso` (evita doble-envío entre
   corridas).
4. Por cada una, resuelve el JID con el socket **de ese usuario específico**, reemplaza
   `{{nombre}}` en la plantilla y la encola en la cola anti-ban **de ese usuario**.
5. El callback de resultado de la cola actualiza el registro a `enviado` o `fallido` cuando
   el envío real ocurre (minutos después, por el delay anti-ban).

Este servicio se expone como `POST /api/cron/process-reminders`, protegido por `x-api-key`.

### Scheduler interno (desarrollo local y respaldo en producción)

[`src/server.js`](backend/src/server.js) también corre `processPendingReminders()` cada 60s
con un `setInterval` mientras el proceso esté vivo. Esto hace que **en local no necesites
disparar nada a mano**: basta con tener `npm run dev` corriendo y un recordatorio con
`fecha_envio` ya vencida se envía solo en el siguiente ciclo (máx. 60s de espera).

En producción esto sigue sin reemplazar al cron externo (sección siguiente): un
`setInterval` solo corre mientras el proceso está despierto, y Render/Fly duermen el
contenedor tras ~15 min de inactividad. El cron externo es el que lo despierta; el
`setInterval` interno solo reduce la latencia mientras ya está despierto.

### Cómo disparar el cron gratis

> **⚠️ GitHub Actions `schedule` NO es confiable para intervalos menores a 1 hora —
> confirmado en producción.** Se incluye
> [`.github/workflows/cron-reminders.yml`](.github/workflows/cron-reminders.yml) configurado
> para correr cada 5 minutos, pero GitHub **no garantiza** ese intervalo: bajo carga (sobre
> todo en repos privados, que tienen menor prioridad en la cola de ejecución), puede atrasarse
> mucho más que "unos minutos". En un caso real se observaron corridas separadas por **~2
> horas** en vez de 5 minutos — suficiente para que un usuario reporte "los recordatorios no
> se mandan si no tengo la página abierta" (con la página abierta, el polling del frontend
> mantiene despierto el backend y el `setInterval` interno de 60s hace el trabajo real; sin
> ella, el único disparador que queda es este cron poco confiable de GitHub). No es un bug del
> código — es una limitación documentada de la plataforma de GitHub Actions.
>
> **Mecanismo recomendado: [cron-job.org](https://cron-job.org)** (gratuito, resolución de 1
> minuto, sí respeta el intervalo configurado). Configúralo apuntando a:
> - **URL**: `https://<tu-backend>.onrender.com/api/cron/process-reminders`
> - **Método**: `POST`
> - **Headers**: `x-api-key: <mismo valor que API_KEY en Render>` y
>   `Content-Type: application/json`
> - **Intervalo**: cada 5 minutos
>
> **El workflow de GitHub Actions ya NO corre solo** (se quitó su disparador `schedule`,
> [`.github/workflows/cron-reminders.yml`](.github/workflows/cron-reminders.yml) — queda solo
> `workflow_dispatch` por si hace falta correrlo a mano). Esto no era únicamente cosmético:
> mientras estuvo activo junto con cron-job.org, ambos podían llamar a
> `/api/cron/process-reminders` casi al mismo tiempo, y **cada llamada duplicaba el envío real**
> de cualquier recordatorio que coincidiera en ambas — el cron original no tenía ninguna
> protección contra corridas superpuestas. Esto ya se corrigió del lado del backend también
> (`procesando`, un candado en memoria en `processPendingReminders()` que hace que una segunda
> llamada mientras la primera sigue en curso no haga nada), así que aunque quede más de un
> disparador activo por accidente, ya no debería volver a mandar el mismo mensaje dos veces —
> pero de todos modos, usa **solo cron-job.org** como disparador programado para no depender de
> esa protección de más.

Configura en el repo, **Settings → Secrets and variables → Actions** (solo si vas a usar
`workflow_dispatch` a mano; ya no hace falta si únicamente usas cron-job.org):

- `BACKEND_URL`: URL pública del backend (Render/Fly).
- `API_KEY`: el mismo valor que `API_KEY` en `backend/.env`.

Otra alternativa: **Upstash QStash** (500 mensajes/día gratis, con reintentos automáticos si
el backend está "dormido" — cold start de Render).

En cualquier caso, cada llamada del cron también sirve como *keep-alive* que despierta el
backend si estaba dormido — por eso la persistencia de sesión (sección 5) es indispensable:
sin ella, cada despertar pediría un QR nuevo.

## 4. Frontend PWA (`frontend/`)

Next.js 14 (App Router) + Tailwind CSS.

```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev
```

- [`public/manifest.json`](frontend/public/manifest.json): nombre, íconos, `display: standalone`
  — instalable en Android/iOS ("Agregar a pantalla de inicio"). Los íconos
  (`public/icons/icon-192.png`, `icon-512.png`) son placeholders generados por script (un
  cuadro blanco con una franja roja arriba, sin dependencias de imagen); **reemplázalos con tu
  logo real** cuando lo tengas, conservando los mismos nombres y tamaños.
- [`src/app/layout.tsx`](frontend/src/app/layout.tsx) declara `icons` y `appleWebApp` en el
  `metadata` de Next.js, que genera automáticamente `<link rel="apple-touch-icon">` y los
  `<meta name="apple-mobile-web-app-*">` que iOS necesita para que "Agregar a inicio" use el
  ícono y el modo standalone correctos (en iOS no existe un prompt automático de instalación
  como en Android/Chrome — siempre es manual, desde el botón de compartir de Safari).
- [`public/sw.js`](frontend/public/sw.js): Service Worker mínimo — cache-first para el app
  shell, network-first (con fallback a cache) para `/api/*`. Se registra desde
  [`src/components/RegisterSW.tsx`](frontend/src/components/RegisterSW.tsx).
- **Importante — seguridad**: el frontend nunca llama directo al backend de Baileys desde
  el navegador. Las route handlers server-side en
  [`src/app/api/whatsapp/session/`](frontend/src/app/api/whatsapp/session/) (`status`, `qr`,
  `connect`, `logout`) hacen de proxy: leen el header `Authorization: Bearer <token>` que
  puso el cliente y lo reenvían tal cual al backend, que lo valida contra Supabase Auth para
  saber de qué usuario se trata. No hay ninguna API key compartida en el frontend para estos
  endpoints — cada quien solo puede ver/controlar su propia sesión.
- [`src/components/WhatsAppStatus.tsx`](frontend/src/components/WhatsAppStatus.tsx) ("Mi
  número de WhatsApp"): obtiene el access token con `supabase.auth.getSession()`, hace
  polling cada 5s a `/api/whatsapp/session/status`, y según el estado muestra un botón
  **"Conectar WhatsApp"** (dispara `session/connect`), el QR (`<img>` con el data URL) cuando
  `status === 'qr'`, o "Conectado" + botón **"Desvincular número"** (`session/logout`) cuando
  `status === 'connected'`. Cada usuario ve y vincula únicamente su propio número — los
  recordatorios que programe se enviarán desde ahí, no desde un número compartido.

### Módulos y navegación (menú hamburguesa)

La app está organizada en módulos independientes, cada uno con su propia ruta, conectados por
un menú hamburguesa — no es una sola pantalla con todo apilado.

- [`src/app/(app)/layout.tsx`](frontend/src/app/\(app\)/layout.tsx): layout compartido por
  todas las rutas autenticadas. Aquí vive **toda** la lógica de: (1) mostrar `LoginForm` si no
  hay sesión, (2) mostrar solo `AccountStatusBanner` si la cuenta sigue inactiva (sección 4.1),
  (3) mostrar
  [`RequireWhatsAppConnection.tsx`](frontend/src/components/RequireWhatsAppConnection.tsx) si el
  usuario está activo pero **su WhatsApp no está conectado** — ningún módulo sirve de nada sin
  eso, así que se bloquea con la misma pantalla completa (sin menú, con la opción de cerrar
  sesión) y se muestra ahí mismo `WhatsAppStatus.tsx` para que pueda escanear el QR sin navegar
  a otra parte — y (4) si todo está en orden, el header con el botón ☰ y el drawer de
  navegación. Las páginas de cada módulo (`page.tsx` dentro de cada carpeta) ya no repiten
  ninguna de estas comprobaciones — el grupo de rutas `(app)` (paréntesis: no agrega segmento a
  la URL) se encarga una sola vez. `RequireWhatsAppConnection` vive dentro de
  `WhatsAppStatusProvider` (necesita su contexto) pero **envuelve** a `ClientesProvider`/
  `RecordatoriosProvider`/`PlantillasProvider`: mientras el WhatsApp no esté conectado, esos tres
  providers ni siquiera se montan, así que no se disparan fetchs de contactos/recordatorios/
  plantillas que el usuario no podría usar de todos modos.
- **`/` — Dashboard** ([`(app)/page.tsx`](<frontend/src/app/(app)/page.tsx>)): una gráfica de
  pastel ([`PieChart.tsx`](frontend/src/components/PieChart.tsx)) con la distribución de
  recordatorios por estado (incluyendo `pausado`, sección 4.6) arriba, una grilla de métricas
  (contactos y grupos por separado, recordatorios programados, cuántos son hoy, enviados,
  fallidos) calculadas en el cliente a partir de los mismos hooks que usan los demás módulos, y
  hasta abajo un botón grande "Nuevo recordatorio" que navega directo a `/calendario/nuevo` (el
  módulo de creación, sección 4.2). Cada tarjeta de la grilla es un `<Link>` que navega al
  módulo relacionado (`/contactos?tab=contactos`, `/contactos?tab=grupos`, `/mensajes`,
  `/calendario`, `/logs?estado=enviado`, `/logs?estado=fallido`) en vez de ser solo un número
  decorativo. El bloque de estado de WhatsApp que antes vivía aquí se movió a `/perfil`
  (sección 4.6).
- **`/contactos` — Cartera de contactos**:
  [`ContactosSection.tsx`](frontend/src/components/contactos/ContactosSection.tsx) (sección
  4.4: categorías + importar desde WhatsApp). El botón **"Agendar"** de cada fila navega a
  `/calendario/nuevo?cliente=<id>`.
- **`/calendario` — Agenda (solo consulta)**:
  [`AgendaSection.tsx`](frontend/src/components/agenda/AgendaSection.tsx) (sección 4.2) ya no
  incluye ningún formulario — es puramente el calendario mensual + la lista del día
  seleccionado. El botón **"+"** navega a `/calendario/nuevo`, y "Editar" en cada tarjeta
  navega a `/calendario/editar/<id>`.
- **`/calendario/nuevo` y `/calendario/editar/[id]`**: pantallas dedicadas a crear/editar un
  recordatorio, usando el mismo [`RecordatorioForm.tsx`](frontend/src/components/agenda/RecordatorioForm.tsx)
  (sección 4.2). Al terminar (o cancelar), regresan a `/calendario`.
- **`/mensajes` — "Recordatorios"/"Reminders"** (`nav.mensajes`, antes "Mensajes por cliente"):
  la vista de lista de todo lo agendado (en `pendiente`/`en_proceso`/`pausado`), como
  alternativa a navegar día por día en `/calendario`. Tiene un botón **"+"** (mismo patrón que
  en `/calendario`) que navega a `/calendario/nuevo`, y tres filtros combinables: pestañas
  "Todos/Contactos/Grupos" (según `cliente.es_grupo`, buscado por `cliente_id` contra la lista
  de `useClientes()` — el `select` de `recordatorios` no trae `categoria` en el `join`, así que
  se resuelve así en vez de duplicar esa columna en la consulta), un `<select>` de contacto/grupo
  específico (acotado a lo que quedó tras el filtro de tipo), y un `<select>` de categoría del
  contacto (mismo patrón "Todas"/"Sin categoría"/cada categoría que en Contactos, sección 4.4).
  Pensado para responder "¿qué le tengo agendado a este cliente (o a este grupo, o a toda una
  categoría de clientes)?" de un vistazo.
- **`/perfil` — Mi perfil**: datos de la cuenta, estado de WhatsApp
  (`WhatsAppStatus.tsx`/`WhatsAppStatusProvider.tsx`), y los controles de "Pausar
  todos"/"Reanudar todos" los recordatorios (sección 4.6).
- **`/plantillas` — Plantillas de mensajes** (sección 4.5): crear, editar y borrar mensajes
  reutilizables con una o varias imágenes adjuntas opcionales, que luego se pueden elegir desde
  `RecordatorioForm.tsx` al agendar.
- **`/logs` — Historial de envíos**: recordatorios en `enviado`/`fallido`, con filtro rápido
  por estado, ordenados por el envío más reciente primero (`ultimo_envio` si es recurrente, si
  no `fecha_envio`).
- **`/admin`** (sección 4.1): también vive dentro del mismo grupo `(app)`, solo que además del
  gating compartido (logueado + activo), la propia página vuelve a comprobar `is_admin` — el
  link ni siquiera aparece en el menú para quien no sea admin, pero la ruta se protege también
  por si alguien la teclea directo.
- **[`ReminderCard.tsx`](frontend/src/components/agenda/ReminderCard.tsx)**: la tarjeta de
  recordatorio (franja de color por estado, badge, mensaje, botones editar/cancelar/pausar/
  reanudar) se factorizó a un componente compartido porque la usan tres módulos (`/calendario`,
  `/mensajes`, `/logs`) — evita mantener la misma tarjeta triplicada. Los botones "Pausar"/
  "Reanudar" (sección 4.6) solo aparecen si el recordatorio es recurrente.

**Autenticación**: [`src/lib/AuthProvider.tsx`](frontend/src/lib/AuthProvider.tsx) envuelve
`supabase.auth` (email + contraseña) y expone `useAuth()`. Es obligatoria porque las policies
de RLS exigen `auth.uid() = user_id`; sin sesión, Supabase rechaza los inserts.
[`LoginForm.tsx`](frontend/src/components/auth/LoginForm.tsx) alterna entre iniciar sesión y
crear cuenta. Nota: por defecto Supabase Auth pide confirmar el correo al crear cuenta; para
probar más rápido en desarrollo, desactiva "Confirm email" en
**Authentication → Providers → Email**.

### 4.1 Módulo de administración de usuarios

Pensado para ti como dueño del servicio: **cada cuenta nueva se registra desactivada por
defecto** y no puede hacer nada con su agenda hasta que tú la apruebes desde `/admin` (por
ejemplo, tras confirmar un pago). También te sirve para pausar después a un cliente que deje
de pagar, sin borrar sus datos.

- **`profiles`** (creada por [`002_admin_profiles.sql`](supabase/002_admin_profiles.sql)):
  un trigger (`handle_new_user`) inserta una fila aquí automáticamente cada vez que alguien
  se registra en `auth.users`, con `is_admin = false` por defecto. Desde
  [`004_usuarios_inactivos_por_defecto.sql`](supabase/004_usuarios_inactivos_por_defecto.sql),
  el default de `activo` es `false` — o sea que toda cuenta nueva nace bloqueada. La migración
  `002` deja **bootstrapeado como admin** al primer usuario que existía en el proyecto al
  momento de escribirla; para dar de alta más administradores, hazlo desde el panel `/admin`
  (una vez que tengas al menos un admin) o vuelve a correr manualmente:
  `update public.profiles set is_admin = true where email = '...';`.
- **RLS**: cada usuario solo puede leer su propio `profile` (para que la UI le muestre el
  aviso de "cuenta pendiente"); los admins pueden leer todos (usando la función `is_admin()`,
  marcada `security definer` para evitar la recursión de RLS que ocurriría si la policy de
  `profiles` tuviera que consultar `profiles` bajo RLS). Solo los admins pueden actualizar
  filas de `profiles`.
- **Bloqueo real en la base de datos, no solo en la UI**: `is_active()` (misma idea que
  `is_admin()`, definida en `004_usuarios_inactivos_por_defecto.sql`) se usa en las policies
  de `insert` de `clientes` y `recordatorios`. Aunque alguien intente llamar a Supabase
  directo (saltándose el frontend), no puede crear nada mientras `activo = false`.
- **RPCs** `admin_list_users()` y `admin_set_user_active(target_user_id, new_active)`: ambas
  son `security definer` pero verifican `is_admin()` como primera línea y lanzan una
  excepción si quien llama no es admin — así cualquier usuario autenticado puede *invocarlas*
  (para que PostgREST las exponga), pero solo un admin real puede *ejecutarlas* con éxito.
- **Frontend**: [`useProfile.ts`](frontend/src/hooks/useProfile.ts) expone el perfil del
  usuario actual (`activo`, `is_admin`). Si `activo === false`, el layout compartido
  ([`(app)/layout.tsx`](<frontend/src/app/(app)/layout.tsx>)) **no renderiza ningún módulo** —
  ni siquiera el menú hamburguesa — y muestra solo
  [`AccountStatusBanner.tsx`](frontend/src/components/AccountStatusBanner.tsx): un usuario
  recién registrado no ve ni puede tocar nada hasta ser aprobado. Si `is_admin === true`, el
  ítem "Administración" aparece en el menú y lleva a
  [`/admin`](<frontend/src/app/(app)/admin/page.tsx>) (tabla con cada usuario, su correo,
  cantidad de clientes/recordatorios y un botón para activar/desactivar, usando
  [`useAdminUsers.ts`](frontend/src/hooks/useAdminUsers.ts)) — esa ruta está bloqueada para
  cualquiera que no sea admin, tanto en la UI como en las RPCs.
- **Efecto real de desactivar a un usuario ya aprobado**: `backend/src/services/reminders.js`
  consulta `profiles` en cada corrida del cron y excluye (con `.not('user_id', 'in', ...)`)
  los recordatorios de usuarios con `activo = false`. Quedan en `pendiente` — no se marcan
  como `fallido` — así que al reactivar la cuenta, el siguiente ciclo del cron los retoma
  normalmente (si ya venció su `fecha_envio`, se envían de inmediato).

### 4.2 Agenda tipo calendario, calendario propio y recordatorios recurrentes

- **[`Calendar.tsx`](frontend/src/components/Calendar.tsx)**: componente propio de calendario
  mensual (sin librerías externas). El día de hoy se marca con un círculo rojo (como la app
  Calendario de iOS), el día seleccionado con un círculo verde, y los días con al menos una
  fila real (`markedDates`) muestran un punto **verde**. Soporta selección simple o múltiple
  (`selected: string[]` + `onToggle`) y, con `disablePast={false}`, permitir navegar y elegir
  días pasados (necesario para *revisar* la agenda, no solo para crear recordatorios futuros).
  También acepta `month`/`onMonthChange` para operar en modo controlado (necesario para que
  `AgendaSection` sepa qué mes está visible y recalcule las proyecciones de abajo).
- **Recordatorios recurrentes en días futuros, sin filas reales todavía**: como una fila
  recurrente se reprograma sobre sí misma (ver más abajo), el calendario solo tendría un punto
  en su próxima fecha de envío — no mostraría que "esto se repite cada lunes", por ejemplo.
  [`lib/recurrence.ts`](frontend/src/lib/recurrence.ts) reimplementa en el frontend la misma
  aritmética de fechas que usa el backend (`nextOccurrence`/`occurrencesInRange`) para
  **proyectar**, solo para el mes visible, en qué días caerá cada recordatorio recurrente.
  Esos días se marcan con un punto **violeta** (`recurringDates`) y, si el usuario selecciona
  uno de esos días, la lista de abajo muestra una tarjeta punteada "Se repetirá aquí" con el
  mensaje y la frecuencia — sin botones de editar/cancelar, porque no es una fila real
  todavía, es una proyección.
  - **Bug corregido**: el rango que se le pasaba a `occurrencesInRange` para calcular las
    proyecciones del día seleccionado usaba la misma medianoche (`00:00:00`) como inicio y
    como fin del rango — cualquier ocurrencia con hora distinta de medianoche (ej. 9am) caía
    fuera y nunca se detectaba, así que el punto del calendario aparecía bien (usa el rango de
    todo el mes) pero el detalle del día se veía vacío. Ahora el fin del rango es
    `23:59:59.999` de ese mismo día (y el fin del mes usa la misma corrección).
  El violeta **también** se muestra en el día donde vive la fila
  real (su próxima fecha de envío) — `occurrencesInRange` siempre incluye esa fecha como su
  primera ocurrencia, y `Calendar.tsx` deja que el violeta gane sobre el punto verde ahí, para
  que sea obvio a simple vista cuáles recordatorios son recurrentes y cuáles no, sin importar
  si estás viendo su fecha real o una de sus repeticiones futuras. En la lista del día,
  [`ReminderCard.tsx`](frontend/src/components/agenda/ReminderCard.tsx) agrega un anillo
  violeta (`ring-1 ring-violet-300`) a la tarjeta cuando `es_recurrente`, además del color de
  la franja izquierda que sigue indicando el estado (pendiente/enviado/fallido).
- **[`AgendaSection.tsx`](frontend/src/components/agenda/AgendaSection.tsx)** — módulo de
  **solo consulta** en `/calendario`. El calendario mensual sirve para navegar: al tocar un
  día se muestra, debajo, la lista de recordatorios de ese día como tarjetas con una franja de
  color según su estado (ámbar `pendiente`, azul `en_proceso`, verde `enviado`, rojo
  `fallido`) — la idea visual de los bloques de colores de una app de calendario, aplicada a
  recordatorios puntuales en vez de eventos con duración (no se inventa una hora de fin que los
  datos no tienen). No tiene ningún formulario embebido.
- **[`RecordatorioForm.tsx`](frontend/src/components/agenda/RecordatorioForm.tsx)** — crear y
  editar viven en pantallas propias (`/calendario/nuevo` y `/calendario/editar/[id]`),
  deliberadamente separadas del calendario de consulta. Antes, el formulario de "fechas
  específicas"/"recurrente" abría un **segundo calendario** encimado con el de consulta en la
  misma pantalla, lo cual confundía cuál era cuál; ahora cada pantalla muestra un único
  calendario con un solo propósito. El botón **"+"** en `/calendario` navega a
  `/calendario/nuevo?fecha=<día seleccionado>`; "Editar" en cualquier tarjeta (en
  `/calendario` o `/mensajes`) navega a `/calendario/editar/<id>`. Al guardar o cancelar,
  ambas pantallas regresan a `/calendario`. El formulario tiene tres modalidades (fecha única,
  fechas específicas, recurrente) y, ortogonal a las tres, un selector de **una o varias horas**
  — no es un cuarto modo aparte, vive dentro de cada una de las otras tres.
- **Una o varias horas, dentro de cualquier modalidad** (no un modo propio): un primer intento
  metió esto como un cuarto modo ("Varias horas") separado de "fecha única"/"fechas
  específicas"/"recurrente", pero eso obligaba a elegir entre "un día, varias horas" o "varias
  fechas, una hora" sin poder combinarlos, y dejaba fuera a "recurrente" por completo. Ahora
  `horas: string[]` (con chips para agregar/quitar, igual que antes) se usa siempre, sin importar
  la modalidad — al guardar:
  - **Fecha única / fechas específicas**: se arma el cruce `fechas × horas`
    (`fechas.flatMap(f => horas.map(h => ...))`). Con una sola fecha y varias horas, esto es
    exactamente "un mismo día, distintas horas"; con varias fechas y una hora, es el
    comportamiento de siempre de "fechas específicas"; con varias fechas y varias horas, crea
    todas las combinaciones. Con exactamente una combinación se sigue usando `onAdd` (una sola
    fila) en vez de `onAddMultiple`, igual que antes de este cambio.
  - **Recurrente**: se crea una serie recurrente independiente por cada hora elegida (mismo
    `frecuencia`/`intervaloDias`/`fechaFin`, llamando a `onAddRecurrente` una vez por hora,
    secuencial y no en paralelo — así `evitarChoqueDeHorario()` del backend ve cada serie ya
    creada al revisar la siguiente y no terminan pisándose entre sí). Ej. "recordar cada lunes a
    las 9am **y** a las 6pm" son dos series recurrentes con la misma frecuencia semanal.
  - No hizo falta tocar el backend ni `RecordatoriosProvider.tsx` para el caso fecha
    única/específicas — `onAddMultiple`/`addRecordatoriosMultiples` ya aceptaba un arreglo
    arbitrario de instantes ISO sin importarle si difieren en fecha o en hora; la fila resultante
    en `recordatorios` es indistinguible de una creada antes de este cambio.
  - Al editar un recordatorio existente (una sola fila) el selector de horas vuelve a ser un
    único `<input type="time">` — no tendría sentido "agregar horas" ahí, porque editar no crea
    filas nuevas.
- **Espacio mínimo de 1 minuto entre recordatorios propios**: `useRecordatorios.ts` rechaza
  crear o editar un recordatorio si cae a menos de 60 segundos de otro que ya tengas en
  `pendiente`/`en_proceso` (`findNearbyReminder`), sin importar para qué cliente sea — todos
  salen del mismo número de WhatsApp, así que agendar varios en el mismo instante se vería
  igual de sospechoso para WhatsApp que enviarlos de verdad así de seguido. Esto es una capa
  extra de prevención en el momento de agendar; la cola anti-ban del backend (sección 2) ya
  espacia los envíos reales 30-60s pase lo que pase (así que un choque de horarios nunca fue
  un riesgo real de "ráfaga" para WhatsApp, solo una coincidencia visual en el calendario).
  - **Corregido — reprogramaciones automáticas también se revisan ahora**: esta validación
    solo corría al crear/editar a mano; un recordatorio **recurrente** que se reprograma solo
    tras cada envío (`markEnviadoYReprogramar`/`markFallidoRecurrenteYReprogramar` en
    `backend/src/services/reminders.js`) nunca volvía a pasar por ella, así que su horario fijo
    podía terminar coincidiendo con otro recordatorio agendado después sin que nadie lo notara
    — se reportó justo este caso en producción (un recordatorio de grupo recurrente y uno de
    contacto cayendo el mismo minuto). `evitarChoqueDeHorario()` ahora corre en ambas
    funciones de reprogramación: si la siguiente fecha calculada cae a menos de 60s de otro
    recordatorio activo del mismo usuario, la empuja justo después de ese conflicto (hasta 5
    intentos, por si encadena con un tercero). Sigue sin ser una barrera de seguridad — ya lo
    era la cola anti-ban — es solo para que el calendario no muestre dos recordatorios pisando
    el mismo minuto sin que el usuario lo haya decidido así.
- **Modo "fechas específicas"**: al guardar, `addRecordatoriosMultiples` (en
  [`useRecordatorios.ts`](frontend/src/hooks/useRecordatorios.ts)) inserta **una fila normal
  por cada fecha** marcada — reutiliza el 100% de la infraestructura existente, sin lógica de
  recurrencia ni columnas nuevas.
- **Modo "recurrente"**: se elige una fecha de inicio, una frecuencia
  (`diaria|semanal|mensual|personalizada` con intervalo en días) y opcionalmente una fecha de
  fin. `addRecordatorioRecurrente` inserta **una sola fila** con `es_recurrente = true`. En
  vez de generar todas las ocurrencias futuras por adelantado, el backend
  (`markEnviadoYReprogramar` en [`reminders.js`](backend/src/services/reminders.js))
  **reprograma la misma fila** tras cada envío exitoso: calcula la siguiente `fecha_envio`
  según la frecuencia y la regresa a `estado = 'pendiente'`, guardando `ultimo_envio` con la
  marca de tiempo del envío real. Si `fecha_fin` ya se cumplió, la deja en `enviado` y no la
  vuelve a programar.
  - Trade-off consciente: al reutilizar la misma fila, **no queda historial de cada envío
    individual** de un recordatorio recurrente, solo el más reciente (`ultimo_envio`). Si
    necesitas auditoría completa, la alternativa es materializar cada ocurrencia como fila
    aparte (mencionado en "Próximos pasos").
  - Limitación conocida: la frecuencia `mensual` usa `Date.setMonth()`, que en meses cortos
    puede desbordar (ej. 31 de enero + 1 mes cae en el 2-3 de marzo en vez de fin de febrero).
    Es una particularidad de la aritmética de fechas de JavaScript, documentada en el código.
  - **Días de la semana permitidos** (columna `dias_permitidos`, migración
    [`013_dias_permitidos_recurrente.sql`](supabase/013_dias_permitidos_recurrente.sql)): un
    arreglo opcional de días (`0`=domingo … `6`=sábado, igual que `Date.getDay()`) que restringe
    en cuáles puede caer cada repetición — pensado para "todos los días excepto fines de semana"
    con frecuencia `diaria`, aunque aplica a cualquier frecuencia. `null` (el default, y el valor
    de todo recordatorio creado antes de esta columna) significa "sin restricción". La lógica
    vive enteramente en `computeNextFechaEnvio()`/`ajustarADiaPermitido()` en
    [`reminders.js`](backend/src/services/reminders.js): después de calcular la siguiente fecha
    de la forma de siempre (según la frecuencia), si esa fecha cae en un día no permitido, se
    empuja día por día (conservando la hora) hasta el próximo día permitido — no valida ni ajusta
    la fecha de inicio elegida al crear el recordatorio, solo las ocurrencias siguientes que
    calcula el backend. En `RecordatorioForm.tsx`, con los 7 días marcados (el default) se manda
    `null` en vez del arreglo completo, para que un recordatorio sin esta restricción sea
    indistinguible de uno creado antes de que existiera esta opción. Con varias horas elegidas
    (sección anterior), los días permitidos aplican por igual a cada una de las series
    recurrentes que se crean, una por hora.
- **"Enviar ahora"**: botón en [`ReminderCard.tsx`](frontend/src/components/agenda/ReminderCard.tsx)
  (visible junto a Editar/Pausar/Cancelar, solo con `estado === 'pendiente'`) para mandar un
  recordatorio en este instante en vez de esperar su `fecha_envio` programada. A diferencia del
  resto de acciones sobre `recordatorios` (que van directo a Supabase vía RLS), esta necesita el
  socket de WhatsApp vivo del backend, así que pasa por una ruta propia:
  `POST /api/reminders/:id/send-now` (`backend/src/routes/reminders.js`, protegida por
  `requireUser`) → `sendReminderNow()` en
  [`reminders.js`](backend/src/services/reminders.js). El cuerpo de "resolver teléfono/JID,
  preparar adjuntos, encolar y marcar según el resultado" se factorizó a
  `intentarEnviarRecordatorio()`, compartida con `processPendingReminders()` (el cron) — "enviar
  ahora" es literalmente lo mismo que hace el cron al procesar un recordatorio, solo que
  disparado a mano y sin aplicar la tolerancia de 5 minutos (`MAX_ATRASO_ENVIO_MS`, sección 4.8),
  que no tendría sentido aquí: es una acción explícita del usuario, no un envío automático fuera
  de horario.
  - **La siguiente ocurrencia programada queda saltada, no se duplica**: si el recordatorio es
    recurrente, el envío manual pasa por la misma `markEnviadoYReprogramar()` de siempre, que
    calcula el siguiente ciclo a partir de la `fecha_envio` que **tenía programada** (no de
    "ahora") — el efecto es que la ocurrencia que estaba agendada para después nunca se manda por
    separado, porque ya se contó como "la de este ciclo" al enviarla ahora. Uno único simplemente
    se marca `enviado` sin más, igual que un envío normal.
  - Requiere WhatsApp conectado (`sessionManager.getStatus(userId) === 'connected'`) y que el
    recordatorio siga en `'pendiente'` — falla con un mensaje explícito si no, en vez de encolar
    algo que no se puede completar.
- **Registro histórico de cada ocurrencia enviada de un recurrente**: el trade-off original
  ("reprogramar la misma fila no deja historial de cada envío individual", documentado más
  arriba) tenía una consecuencia real que un usuario reportó directamente: un recordatorio
  recurrente que se envió hoy y se reprogramó para la próxima ocurrencia **desaparecía por
  completo** de "Logs" (que solo filtra `estado IN ('enviado','fallido')` — la fila viva vuelve
  a `'pendiente'`) y del día de hoy en el calendario (que se guía por `fecha_envio`, y esa
  columna ya apunta a la *siguiente* fecha, no a la de hoy). `crearRegistroHistorico()` en
  [`reminders.js`](backend/src/services/reminders.js) resuelve esto sin tocar el mecanismo de
  reprogramación: cada vez que `markEnviadoYReprogramar()`/`markFallidoRecurrenteYReprogramar()`
  avanza la fila viva a la siguiente ocurrencia (no cuando la serie termina — ahí la fila misma
  ya es su propio registro final), inserta una fila nueva con `estado: 'enviado'`/`'fallido'`,
  la `fecha_envio` que **tenía programada** esa ocurrencia, y una copia de
  `frecuencia`/`fecha_fin`/`dias_permitidos` (solo para que la tarjeta siga mostrando el badge
  "🔁 frecuencia" con contexto — esa copia nunca vuelve a procesarse porque su `estado` ya es
  terminal, el cron solo mira filas `'pendiente'`). El resultado: "Logs" y el calendario ahora
  muestran cada ocurrencia real que se envió, en su fecha real, mientras la fila viva sigue
  siendo la única que se reprograma hacia adelante. Aplica igual si el envío fue automático
  (cron) o manual ("Enviar ahora", arriba) — ambos pasan por las mismas funciones.
- **Candado contra corridas superpuestas del cron**: `processPendingReminders()` ahora rechaza
  (sin hacer nada) cualquier llamada mientras otra sigue en curso, vía una bandera `procesando`
  en memoria. Antes, si dos disparadores caían casi al mismo tiempo (se observó en producción
  con GitHub Actions y cron-job.org corriendo juntos — ver "Cómo disparar el cron gratis" más
  arriba), ambos podían consultar los mismos recordatorios `'pendiente'` antes de que el
  primero llegara a marcarlos `'en_proceso'`, y los dos terminaban mandando el mismo mensaje por
  separado — un doble envío real a WhatsApp, no solo un dato duplicado en la base. El candado
  hace inofensivo cualquier disparador de más, pase lo que pase del lado de la configuración
  externa del cron.
- **Cuenta atrás en la tarjeta**: mientras un recordatorio sigue `'pendiente'`,
  [`ReminderCard.tsx`](frontend/src/components/agenda/ReminderCard.tsx) muestra cuánto falta
  para su `fecha_envio` (ej. "Falta: 2h 15min"), limitado a las 2 unidades más grandes
  (días/horas/minutos) para no saturar la tarjeta — a nivel de segundos no aporta nada útil para
  algo que normalmente falta minutos u horas. Se recalcula sola cada minuto con un
  `setInterval` que solo corre mientras `estado === 'pendiente'` (no tiene caso seguir
  recalculando en una tarjeta ya resuelta). Si ya debería haber salido y el cron todavía no lo
  recogió, muestra un texto fijo ("en cualquier momento") en vez de una cuenta negativa. La
  lógica de formateo vive en [`lib/countdown.ts`](frontend/src/lib/countdown.ts), compartida con
  las tarjetas "Se repetirá aquí" de abajo.
  - **También en las tarjetas "Se repetirá aquí"** (la proyección violeta de una ocurrencia
    futura de un recurrente, sección 4.2): antes esa proyección solo comprobaba *si* caía en el
    día seleccionado (un booleano), sin guardar la fecha/hora exacta — no había cómo mostrar una
    cuenta atrás precisa. `AgendaSection.tsx` ahora guarda la ocurrencia real que devuelve
    `occurrencesInRange()` para cada tarjeta proyectada, y con eso calcula lo mismo que
    `ReminderCard`. De paso se corrigió una inconsistencia real: `lib/recurrence.ts` (la
    reimplementación en el frontend de `computeNextFechaEnvio()`, usada solo para proyectar en
    el calendario sin llamar al backend) no conocía `dias_permitidos` — con un recordatorio
    "solo días hábiles", el punto violeta podía aparecer en sábado/domingo aunque el backend
    nunca fuera a mandarlo ese día. Ahora `nextOccurrence()`/`occurrencesInRange()` reciben
    `diasPermitidos` y aplican el mismo ajuste día-por-día que `ajustarADiaPermitido()` en el
    backend.
- **Duplicar un recordatorio**: botón "Duplicar" en
  [`ReminderCard.tsx`](frontend/src/components/agenda/ReminderCard.tsx) (visible sin importar el
  `estado` — a diferencia de Editar/Pausar/Cancelar, duplicar un recordatorio ya enviado o
  fallido es un caso de uso válido: "mándale esto mismo a otra persona"). Navega a
  `/calendario/nuevo?duplicar=<id>` en vez de mutar nada; `NuevoRecordatorioContent`
  (`calendario/nuevo/page.tsx`) busca ese id en los recordatorios ya cargados (sin pedir nada
  nuevo al backend) y lo pasa como `duplicateFrom` a
  [`RecordatorioForm.tsx`](frontend/src/components/agenda/RecordatorioForm.tsx), que precarga
  mensaje, imágenes, contacto/grupo, fecha/hora y — si el original era recurrente —
  frecuencia/intervalo/fecha fin/días permitidos, arrancando en modo "recurrente" directamente.
  A diferencia de editar, el selector de contacto/grupo **no** se deshabilita, que es justo el
  punto: cambiar el destinatario (u cualquier otro campo) antes de guardar, sin partir de un
  formulario vacío. Es la misma idea que "usar una plantilla" (`applyPlantilla`), solo que la
  fuente es un recordatorio existente en vez de una plantilla guardada — el original nunca se
  toca, esto siempre crea una fila nueva.

### 4.3 Tema visual

La app usa un tema claro inspirado en la app Calendario de iOS: fondo `slate-50`, tarjetas
blancas con `rounded-2xl` + `shadow-sm` + borde `slate-200`, rojo para "hoy"/acciones
destructivas, verde esmeralda como color de acción primaria, y los mismos cuatro colores
pastel (ámbar/azul/verde/rojo) para el estado de los recordatorios en toda la app (el
calendario, la lista del día, y el panel de administración). No hay un archivo central de
"tema" — son clases de Tailwind repetidas de forma consistente en cada componente; si cambias
la paleta, ajusta esas clases componente por componente.

### 4.4 Contactos: renombrado, categorías e importación desde WhatsApp

- **Renombrado "Clientes" → "Contactos"**: la ruta es `/contactos`
  ([`(app)/contactos/page.tsx`](<frontend/src/app/(app)/contactos/page.tsx>)) y el componente
  es [`ContactosSection.tsx`](frontend/src/components/contactos/ContactosSection.tsx). Es un
  renombrado **de cara al usuario únicamente**: la tabla de Supabase, la columna
  `recordatorios.cliente_id`, el hook `useClientes.ts` y el tipo `Cliente` siguen llamándose
  igual internamente (ver la nota en la sección 1). Si más adelante quieres el renombrado
  completo hasta el esquema, es un cambio aparte con más riesgo (afecta RLS, la función
  `admin_list_users()`, y cada `select`/`insert` que referencia `clientes`).
- **Categorías**: campo de texto libre (no un enum), sin categoría por defecto — un contacto
  nuevo empieza con `categoria = null` a menos que escribas una. El campo de alta/import usa
  [`CategoriaAutocomplete.tsx`](frontend/src/components/contactos/CategoriaAutocomplete.tsx),
  un combobox propio (deja escribir libremente y muestra debajo las categorías ya usadas que
  coincidan con lo escrito) en vez de un `<input list="...">` (datalist nativo): el datalist sí
  deja escribir cualquier cosa, pero el ícono de flecha que le agregan los navegadores lo hace
  ver como un `<select>` de opciones cerradas, además de que su UI de sugerencias es
  inconsistente entre navegadores. El filtro de la lista tiene tres tipos de opción: "Todas las
  categorías" (sin filtrar), "Sin categoría" (`clientes.filter(c => !c.categoria)`, para
  encontrar a los que aún no clasificaste) y cada categoría real. Cada fila muestra su
  categoría como badge.
- **Editar un contacto**: el botón "Editar" de cada fila carga sus datos (nombre, teléfono —
  separado de nuevo en código de país + número local buscando cuál código de
  [`lib/countryCodes.ts`](frontend/src/lib/countryCodes.ts) hace match, probando primero los
  más largos para no confundir prefijos — y categoría) en el mismo formulario de alta, que
  cambia a modo edición (`editingId`). `updateCliente` (en
  [`useClientes.ts`](frontend/src/hooks/useClientes.ts)) hace el `update` en Supabase. Ya no
  hace falta borrar y volver a crear un contacto solo para cambiarle la categoría. Los grupos
  (más abajo) no se pueden editar así — su `telefono` es un JID, no un número — solo se
  pueden agendar o eliminar.
- **Selector de código de país con bandera**
  ([`CountryCodeSelect.tsx`](frontend/src/components/contactos/CountryCodeSelect.tsx)): un
  `<select>` nativo no puede mostrar algo distinto colapsado que en su lista abierta (el texto
  de la opción elegida es siempre el mismo). Como se pidió mostrar solo la bandera cuando está
  cerrado pero nombre + bandera en la lista, es un desplegable propio (botón + `<ul role="listbox">`
  posicionado en absoluto, que se cierra solo con un listener de `mousedown` fuera del
  contenedor) en vez de un `<select>`.
- **Importar contactos de WhatsApp**: botón "Importar de WhatsApp" en `/contactos` que llama a
  `GET /api/whatsapp/session/contacts` (sección 2) a través de
  [`useWhatsAppContacts.ts`](frontend/src/hooks/useWhatsAppContacts.ts). Los contactos cuyo
  teléfono ya existe en la cartera se excluyen automáticamente de la lista para evitar
  duplicados; el resto se puede buscar por nombre/número, seleccionar varios y asignarles una
  categoría en bloque antes de importar. `addClientesBulk` (en
  [`useClientes.ts`](frontend/src/hooks/useClientes.ts)) inserta todos los seleccionados en una
  sola llamada a Supabase. Requiere que el usuario tenga su WhatsApp conectado (sección 4)
  — si no, el botón muestra el error que devuelve el backend en vez de una lista vacía.
  - **Botón "Sincronizar contactos"**: si la sesión ya estaba conectada de una corrida anterior
    del proceso, los eventos pasivos de contactos pueden no volver a dispararse solos. Este
    botón llama a `POST /api/whatsapp/session/contacts/resync`, que ejecuta
    `sock.resyncAppState(ALL_WA_PATCH_NAMES, false)` (API de Baileys para forzar una
    resincronización completa del app-state) y, tras una pequeña espera para que los contactos
    lleguen de forma asíncrona por los eventos del socket, vuelve a pedirlos. Es exactamente
    el caso de "tengo WhatsApp conectado pero todavía no veo mis contactos".
- **El panel de importación siempre refresca al abrirse/cambiar de pestaña**: antes,
  `fetchContacts()`/`fetchGroups()` solo se llamaban la primera vez (`if (!loaded) fetch...()`).
  Los contactos llegan de forma **pasiva** por eventos del socket de WhatsApp, así que si el
  primer `fetch` ocurría antes de que ese evento disparara, la lista se quedaba vacía/incompleta
  **para siempre** en esa sesión de la pestaña — cambiar a "Grupos" y volver a "Contactos" nunca
  reintentaba. Ahora `toggleImportOpen`/`switchImportMode` en
  [`ContactosSection.tsx`](frontend/src/components/contactos/ContactosSection.tsx) piden la
  lista de nuevo cada vez que se abre el panel o se cambia de pestaña, sin importar si ya se
  había cargado antes — el costo es una llamada de más a un endpoint que de todos modos lee de
  una caché en memoria en el backend (`getContacts`/`getGroups` en `sessionManager.js`), no algo
  costoso.
- **Pestañas "Contactos" / "Grupos" para navegar la cartera ya guardada** (no solo para
  importar): el listado principal del módulo ahora se separa en dos pestañas — cada una con su
  propio contador y su propio filtro de categoría (`categoriasExistentes` se recalcula por
  pestaña) — en vez de mezclar contactos y grupos en una sola lista distinguidos solo por el
  ícono 👥. El formulario de alta manual (nombre + teléfono + categoría) solo aparece en la
  pestaña "Contactos", porque un grupo no se puede crear a mano — solo se puede importar. La
  ruta soporta `?tab=contactos` / `?tab=grupos` (leído con `useSearchParams`, por eso la página
  está envuelta en `<Suspense>` igual que `/calendario/nuevo`) para que otros módulos (el
  dashboard) puedan enlazar directo a una pestaña específica.
- **Importar y agendar a grupos de WhatsApp**: el mismo panel de importación tiene un
  selector "Contactos / Grupos" (que se sincroniza con la pestaña de navegación al abrirse). En
  modo grupos, llama a `GET /api/whatsapp/session/groups`
  (a través de [`useWhatsAppGroups.ts`](frontend/src/hooks/useWhatsAppGroups.ts)), que en el
  backend usa `sock.groupFetchAllParticipating()` de Baileys — a diferencia de los contactos
  (que llegan solos por eventos), esto es una consulta directa que siempre trae la lista
  actual. Un grupo importado se guarda con
  `es_grupo = true` y `telefono = <jid del grupo>` (sección 1); se distingue con un ícono 👥
  en la lista de contactos y en el selector de cliente del formulario de recordatorios
  ([`RecordatorioForm.tsx`](frontend/src/components/agenda/RecordatorioForm.tsx)). Al enviar,
  `reminders.js` usa ese JID **directo**, sin pasar por `resolveJid()` (que llama a
  `sock.onWhatsApp()`, pensado para validar números individuales, no aplicable a un grupo).
- **Elegir contacto o grupo al agendar**: `RecordatorioForm.tsx` ahora pide primero "Enviar a: Un
  contacto / Un grupo" y filtra el `<select>` de destinatario según esa elección
  (`clientes.filter(c => destinoTipo === 'grupo' ? c.es_grupo : !c.es_grupo)`) en vez de listar
  contactos y grupos revueltos con solo el ícono 👥 para diferenciarlos. Al editar un
  recordatorio existente, este selector se deshabilita (igual que el de destinatario) y se
  precarga con el tipo correcto leyendo `editingReminder.clientes?.es_grupo`.

### 4.5 Plantillas de mensajes, adjuntos (varias imágenes) y emojis

- **Plantillas** (`/plantillas`,
  [`PlantillasSection.tsx`](frontend/src/components/plantillas/PlantillasSection.tsx) +
  [`usePlantillas.ts`](frontend/src/hooks/usePlantillas.ts)): mensajes reutilizables
  (`nombre`, `mensaje`, opcionalmente varias imágenes) guardados en la tabla `plantillas`
  (migración `007_plantillas_y_adjuntos.sql`, sección 1), con RLS `auth.uid() = user_id`
  igual que el resto de las tablas. Se pueden crear, editar y borrar desde su propio módulo, o
  guardar directamente desde el formulario de un recordatorio (ver abajo).
- **Adjuntos en Supabase Storage**: bucket público `attachments` (creado por la misma
  migración), con una policy de `storage.objects` que solo permite subir/borrar dentro de la
  propia carpeta (`{user_id}/archivo.ext`). Se eligió **público** a propósito: el contenido de
  todos modos se reenvía a un tercero por WhatsApp en cuanto se agenda el recordatorio, así que
  no es información sensible, y evita tener que generar URLs firmadas solo para poder
  previsualizar el adjunto en la UI o que el backend lo descargue al enviar. La subida
  (`uploadAttachment`/`uploadAttachments` en `usePlantillas.ts`) se hace directo desde el
  navegador con la `anon key` — el límite de tamaño (5MB por archivo) y los tipos MIME
  permitidos (`jpeg`, `png`, `webp`) se validan en la configuración del bucket, no en el código.
- **Por qué no hay stickers**: la primera versión de este módulo incluía adjuntar un sticker
  además de imagen, pero se quitó (migración `008_quitar_stickers.sql`) — un sticker real de
  WhatsApp requiere un webp cuadrado con metadata específica, y una imagen cualquiera enviada
  como "sticker" vía Baileys no se ve igual que uno del catálogo de stickers, así que la opción
  generaba más confusión que valor.
- **Varias imágenes por mensaje** (migración `009_multiples_imagenes.sql`): `imagen_url`
  (una sola) se reemplazó por `imagenes_urls text[]` en `recordatorios` y `plantillas`. El
  selector [`ImagenesPicker.tsx`](frontend/src/components/ImagenesPicker.tsx) — compartido
  entre `RecordatorioForm.tsx` y `PlantillasSection.tsx` — deja elegir varios archivos a la vez
  (o ir agregando en llamadas separadas al selector de archivos) y quitar cualquiera de la
  lista con una miniatura + botón "×", mezclando imágenes ya guardadas (al editar) con archivos
  nuevos todavía sin subir. WhatsApp/Baileys no tienen forma de mandar un "álbum" en un solo
  mensaje (no hay un `sendAlbumMessage` en Baileys, solo el tipo de protobuf para *recibir* uno
  que otro cliente mandó) — cada imagen se manda como su propio mensaje, la primera con el texto
  como pie de foto y el resto sin texto, ver más abajo.
- **Selector de plantilla en el formulario de recordatorio**
  ([`RecordatorioForm.tsx`](frontend/src/components/agenda/RecordatorioForm.tsx)): al elegir una
  plantilla se precargan mensaje + imágenes, pero se pueden seguir editando antes de agendar —
  elegir una plantilla no es un vínculo permanente, solo un punto de partida (se copian los
  valores, igual que ya pasaba con `mensaje_plantilla`). También se pueden adjuntar imágenes
  ad-hoc sin pasar por una plantilla, y marcar "Guardar este mensaje como plantilla" para crear
  una nueva plantilla al mismo tiempo que se agenda el recordatorio.
- **Selector de emojis** ([`EmojiPicker.tsx`](frontend/src/components/EmojiPicker.tsx)): lista
  curada de emojis comunes, sin ninguna librería externa (evita peso extra en el bundle y en el
  contenedor del backend). Inserta el emoji en la posición del cursor del textarea asociado
  (`textareaRef.selectionStart/End`) en vez de simplemente agregarlo al final, y se usa tanto en
  el formulario de recordatorios como en el de plantillas — el botón vive debajo de la caja de
  mensaje, junto al texto de ayuda, no arriba junto a la etiqueta.
- **Vista previa en tiempo real** ([`WhatsAppPreview.tsx`](frontend/src/components/WhatsAppPreview.tsx)):
  simula visualmente cómo se va a **ver** el mensaje para quien lo reciba — con varias imágenes,
  las agrupa en una sola cuadrícula dentro de una sola burbuja (hasta 4 miniaturas visibles, con
  un "+N" sobre la última si hay más). Desde que el backend manda un álbum real (ver el punto de
  abajo), esto ya no es una aproximación visual — es exactamente lo que WhatsApp va a mostrar,
  no solo "cómo se ve" independientemente de cómo se entrega. Se actualiza en cada tecla porque
  simplemente renderiza el estado actual del formulario, no hace ninguna llamada. `{{nombre}}`
  se reemplaza igual que en el envío real: en `RecordatorioForm.tsx` usa el nombre del
  contacto/grupo seleccionado si ya hay uno (la vista previa exacta de lo que le va a llegar);
  en `PlantillasSection.tsx`, donde no hay un destinatario fijo, usa un nombre de ejemplo
  (`plantillas.previewSampleName`).
- **Envío con varias imágenes como álbum real de WhatsApp**
  (`backend/src/services/reminders.js` + `backend/src/whatsapp/sessionManager.js`):
  `buildOutgoingContents()` descarga cada imagen con el `fetch` nativo de Node (≥18, sin
  librería HTTP adicional) desde su URL pública de Storage y arma un arreglo de contenidos para
  Baileys (imagen + caption solo en el primero) — sin saber nada de cómo se agrupan al enviarse,
  eso es responsabilidad de la cola. `sessionManager.enqueueMessage()` acepta ese arreglo como
  una sola unidad; `processQueue()` — solo si hay más de una imagen — primero manda un mensaje
  "álbum" (`{ album: { expectedImageCount, expectedVideoCount: 0 } }`, un mensaje de protocolo
  sin contenido visible propio) y usa la `key` que devuelve como `albumParentKey` en cada imagen
  real (`startAlbumIfNeeded()`), que es la asociación `MEDIA_ALBUM` que hace que WhatsApp las
  muestre agrupadas en una sola cuadrícula en vez de N mensajes sueltos — **esto requiere
  Baileys `7.x`** (ver la advertencia al principio de la sección 2); la versión estable `6.x`
  solo tiene el tipo de protobuf para *recibir* un álbum que mandó otro cliente, no para
  mandarlo. El primer elemento (la imagen con el texto) determina si el recordatorio se marca
  enviado/fallido; el resto son best-effort — si alguno falla, se registra en logs pero no
  cambia ese resultado — y se mandan con una pausa fija corta (`GROUP_ITEM_DELAY_MS`, 1.5s)
  entre cada uno, **no** el espaciado anti-ban normal de 30-60s (`MIN_DELAY_MS`/`MAX_DELAY_MS`)
  que sí se aplica entre recordatorios distintos. La razón: ese espaciado largo existe para no
  parecer un bot mandando ráfagas a chats *distintos*; mandar varias fotos como un álbum al
  *mismo* chat es justo lo que hace una persona real al compartir un carrete de fotos, así que
  aplicarle el mismo resguardo solo haría que un recordatorio de varias imágenes tardara varios
  minutos en entregarse completo y bloqueara la cola de ese usuario mientras tanto. Si la
  descarga de cualquier imagen falla antes de encolar (ej. el archivo se borró de Storage), el
  recordatorio completo se marca `fallido` (o se reprograma con error visible si es recurrente)
  — no se pierde silenciosamente.

### 4.6 Mi perfil: estado de WhatsApp persistente, y pausar/reanudar recordatorios

- **El bloque de WhatsApp se movió de `/` a `/perfil`**
  ([`WhatsAppStatus.tsx`](frontend/src/components/WhatsAppStatus.tsx)), y de paso se resolvió
  un problema real de UX: antes, ese componente manejaba su propio `setInterval` de polling
  (cada 5s) con estado local (`useState`). Next.js desmonta y vuelve a montar los componentes de
  cada página al navegar entre rutas, así que cada vez que el usuario salía de la pantalla que
  tenía el bloque y volvía a entrar, el estado se perdía y arrancaba de cero — se veía "Cargando
  estado..." de nuevo aunque la conexión de WhatsApp llevara horas estable. La solución fue sacar
  todo el polling a [`WhatsAppStatusProvider.tsx`](frontend/src/lib/WhatsAppStatusProvider.tsx),
  un contexto de React montado una sola vez en `(app)/layout.tsx` (que **no** se desmonta al
  navegar entre páginas, a diferencia de `children`) — ahora `WhatsAppStatus.tsx` es un
  componente de presentación puro que solo lee `useWhatsAppStatus()`, y entrar/salir de `/perfil`
  ya no reinicia nada porque el polling nunca se detuvo.
- **El mismo problema existía para contactos, recordatorios y plantillas, no solo para
  WhatsApp**: `useClientes()`, `useRecordatorios()` y `usePlantillas()` cargaban sus datos con
  un `useEffect` propio en cada página que los usaba, así que cambiar de pestaña en el menú
  (Dashboard → Contactos → Calendario...) los volvía a pedir desde cero cada vez y se veía un
  parpadeo de "Cargando..." aunque nada hubiera cambiado. Se aplicó el mismo patrón que a
  WhatsApp: [`ClientesProvider.tsx`](frontend/src/lib/ClientesProvider.tsx),
  [`RecordatoriosProvider.tsx`](frontend/src/lib/RecordatoriosProvider.tsx) y
  [`PlantillasProvider.tsx`](frontend/src/lib/PlantillasProvider.tsx) — cada uno es el contexto
  de React que antes vivía dentro del hook, ahora montado una sola vez en `(app)/layout.tsx`.
  Los hooks (`frontend/src/hooks/use{Clientes,Recordatorios,Plantillas}.ts`) quedaron como un
  simple `return use{X}Context()` para no tener que tocar ningún componente que ya los
  consumía — toda la superficie pública (nombres de función, forma del objeto devuelto) es
  idéntica a como era antes, solo cambió *dónde* vive el estado.
- **Desvincular pide confirmación** (`window.confirm`, sin librería de modales — es una acción
  destructiva puntual, no vale la pena montar infraestructura de diálogos propios para una sola
  confirmación) explicando que se van a pausar los recordatorios pendientes hasta reconectar.
- **Pausar/reanudar recordatorios**: un recordatorio pausado (`estado = 'pausado'`, sección 1)
  conserva toda su configuración — a diferencia de cancelar, no se borra — y
  `processPendingReminders()` lo ignora hasta que vuelva a `'pendiente'`. Hay tres formas de
  llegar a este estado:
  1. **Automático al desvincular**: `logoutSession()` en `sessionManager.js` pasa a `'pausado'`
     todos los recordatorios `'pendiente'` del usuario. Al volver a conectar (`connection ===
     'open'` en `attachHandlers`), se reanudan solos — de ahí que el mensaje de confirmación
     pueda prometer "hasta que vincules un número de nuevo" en vez de pedir una acción manual
     extra. Este `resumeUserReminders()` también corre en cualquier reconexión (ej. tras un
     redeploy que recupera la sesión guardada), pero ahí es un no-op inofensivo si no había
     nada pausado.
  2. **Manual, todos de golpe, desde "Mi perfil"**: botones "Pausar todos"/"Reanudar todos"
     (`pauseAllRecordatorios`/`resumeAllRecordatorios` en `useRecordatorios.ts`), útiles por
     ejemplo para unas vacaciones sin querer desvincular el número. Aplican a cualquier
     recordatorio, recurrente o no.
  3. **Manual, uno por uno, solo para recurrentes**: botón "Pausar"/"Reanudar" en
     [`ReminderCard.tsx`](frontend/src/components/agenda/ReminderCard.tsx), visible únicamente
     si `es_recurrente` — uno único ya se puede cancelar sin más, pausarlo no aporta nada que
     cancelar no resuelva igual de bien.
  - **Duración de la pausa** (columna `pausado_hasta`, migración
    [`014_pausado_hasta.sql`](supabase/014_pausado_hasta.sql)): tanto pausar uno como "Pausar
    todos" ahora abren [`PausarPicker.tsx`](frontend/src/components/agenda/PausarPicker.tsx) —
    un selector de 1 día / 3 días / 1 semana / 1 mes / una fecha específica / indefinido, en vez
    de pausar directo. `null` (elegir "indefinido") es el comportamiento de siempre — solo se
    reanuda a mano. Con una duración, se guarda `pausado_hasta` (el instante calculado, ya
    convertido a UTC respetando la zona horaria de la cuenta) y `resumeExpiredPauses()` en
    [`reminders.js`](backend/src/services/reminders.js) —llamada al inicio de cada corrida del
    cron, antes de procesar nada más— reanuda solo los que ya vencieron. No reprograma ni
    reintenta enviar nada por su cuenta: si al reanudarse su `fecha_envio` original ya quedó en
    el pasado (obvio si estuvo pausado varios días), el resto del cron lo trata como cualquier
    otro recordatorio atrasado — la tolerancia de 5 minutos (sección 4.8) lo manda a la
    siguiente ocurrencia en vez de enviarlo tarde, sin lógica especial para este caso.
  - **Bug real corregido — una pausa indefinida se reactivaba sola** (columna
    `pausado_por_desconexion`, migración
    [`015_pausado_por_desconexion.sql`](supabase/015_pausado_por_desconexion.sql)): el primer
    intento de arreglar esto (arriba, ahora superado) solo protegía las pausas **con duración**
    — una pausa indefinida (`pausado_hasta = null`) seguía sin blindaje. La causa real:
    `resumeUserReminders()` se dispara en **cualquier** reconexión de WhatsApp, no solo tras un
    logout — también en una reconexión de rutina (WhatsApp puede cerrar y reabrir la conexión
    sola cada cierto tiempo sin que nadie haga nada, o un redeploy del backend recupera la
    sesión), y antes reanudaba cualquier fila en `'pausado'` sin distinguir el motivo. Se
    reportó exactamente así: "pauso indefinidamente y al día siguiente se vuelve a activar
    solo" — coincide con que WhatsApp reconecta aproximadamente una vez al día. Ahora
    `pauseUserReminders()` (el pausado automático al desvincular, en `sessionManager.js`) marca
    `pausado_por_desconexion = true`, y `resumeUserReminders()` (el reanudado automático al
    reconectar) **solo** toca filas con esa bandera en `true` — una pausa manual (indefinida o
    con duración) nunca la tiene, así que ninguna reconexión de rutina vuelve a tocarla; el
    frontend (`pauseRecordatorio`/`pauseAllRecordatorios`) manda `pausado_por_desconexion: false`
    explícitamente en cualquier pausa que dispare el usuario.
  - En el calendario ([`AgendaSection.tsx`](frontend/src/components/agenda/AgendaSection.tsx)),
    un recordatorio recurrente pausado deja de proyectar sus ocurrencias futuras (el punto
    violeta) — mostrarlas sería prometer envíos que no van a pasar mientras siga pausado.
- **Los estados se actualizan solos, sin refrescar la página, en todos los módulos**: antes,
  cuando el cron marcaba un recordatorio como `enviado`/`fallido` (o el backend lo
  pausaba/reanudaba automático al desvincular/reconectar WhatsApp), el cambio solo se veía tras
  recargar la página — nada en el frontend se enteraba de que había pasado algo del lado del
  servidor. `RecordatoriosProvider.tsx` ahora se suscribe a
  [Supabase Realtime](https://supabase.com/docs/guides/realtime) (Postgres Changes) sobre la
  tabla `recordatorios` (migración `011_realtime_recordatorios.sql`, que la agrega a la
  publicación `supabase_realtime` — sin eso, Realtime no manda nada aunque el código del cliente
  esté suscrito). Ante *cualquier* evento (`INSERT`/`UPDATE`/`DELETE`) simplemente se vuelve a
  pedir la lista completa (`refresh()`) en vez de mezclar a mano el payload del cambio — es una
  sola consulta liviana, y evita reconstruir el `join` con `clientes` (que Postgres Changes no
  manda, solo las columnas de `recordatorios`) fila por fila. Como el provider ya vive una sola
  vez en `(app)/layout.tsx` (más arriba en esta sección) y todos los módulos leen de ese mismo
  contexto, esto los actualiza a **todos** — Dashboard, Calendario, Mensajes y Logs — con un solo
  punto de suscripción, no uno por página. Realtime aplica las mismas policies de RLS
  (`auth.uid() = user_id`) que el resto de las consultas, así que el `filter` por `user_id` en la
  suscripción es una optimización de red, no la barrera de seguridad real.
- **`app.title` cambió de "Recordatorios" a "Remind-me"** — mismo texto en español e inglés a
  propósito (es un nombre propio, no se traduce) — actualizado también en el `<title>` del
  `<head>` (`app/layout.tsx`), `manifest.json` (nombre de la PWA) y el string `browser` que
  Baileys le muestra a WhatsApp en la pantalla de dispositivos vinculados
  (`sessionManager.js`), para que el nombre sea consistente en todos los lugares donde aparece.
  `nav.calendario` (el ítem de navegación de `/calendario`) se probó renombrar a "Reminders" en
  un momento, pero se revirtió — se quedó como "Calendario"/"Calendar". En su lugar,
  `nav.mensajes` (el módulo antes llamado "Mensajes por cliente", en `/mensajes`) es el que pasó
  a llamarse "Recordatorios"/"Reminders" — a diferencia de `app.title`, aquí sí se traduce por
  idioma (no es el nombre del producto, es la etiqueta de un módulo). Ver el rediseño de ese
  módulo más abajo en "Módulos y navegación".
- **Límite conocido: no se puede evitar que el navegador descarte la pestaña en segundo plano**.
  Al cambiar de pestaña/ventana en Windows (o en general, al dejar la pestaña en segundo plano)
  algunos navegadores (el "Memory Saver" de Chrome, activado por defecto) pueden descargar la
  pestaña de memoria para liberar RAM; al volver a ella, el navegador la recarga desde cero —
  se ve como un parpadeo de "Cargando..." seguido de una vuelta a la pantalla en la que estabas,
  pero es en realidad una recarga completa, así que cualquier texto sin guardar en un formulario
  se pierde. Esto lo decide el navegador/sistema operativo, no el sitio — no hay una API web
  para impedirlo. Lo que sí se controla desde el código es no darle al navegador una razón de
  más para elegir esta pestaña: el polling de `WhatsAppStatusProvider.tsx` (sección 4.6) ahora
  se pausa mientras `document.hidden` es `true` y se reanuda (con un poll inmediato, no hasta el
  siguiente tick) cuando la pestaña vuelve a primer plano, en vez de seguir haciendo peticiones de
  red cada 5s sin importar si alguien la está viendo — una pestaña con actividad de red constante
  en segundo plano es más candidata a ser descartada. Aun así, el problema puede seguir
  pasando — es una decisión del navegador/SO, no algo que el código pueda vetar del todo. La
  solución segura del lado del usuario es desactivar "Memory Saver" o agregar el sitio a la
  lista de excepciones en `chrome://settings/performance`.
  - **Mitigación implementada — borrador en `sessionStorage`**: ya que no se puede evitar la
    recarga en todos los casos, [`RecordatorioForm.tsx`](frontend/src/components/agenda/RecordatorioForm.tsx)
    y [`PlantillasSection.tsx`](frontend/src/components/plantillas/PlantillasSection.tsx) guardan
    el mensaje (y, en plantillas, también el nombre) de un recordatorio/plantilla **nuevo** en
    `sessionStorage` en cada cambio, y lo restauran si el componente se vuelve a montar durante
    la misma sesión de la pestaña — que es exactamente lo que pasa en una recarga por descarte de
    memoria (`sessionStorage` sobrevive a la recarga; solo se borra si se cierra la pestaña). El
    borrador se limpia solo al guardar con éxito. Deliberadamente **no** aplica al editar un
    recordatorio/plantilla existente (ahí ya hay datos reales que no conviene pisar con un
    borrador viejo), y tampoco cubre imágenes ya elegidas pero aún sin subir — esas siguen
    perdiéndose porque solo existen como objetos `File` en memoria del navegador, que no hay
    forma de serializar a `sessionStorage`.

### 4.7 Aviso de Privacidad y consentimiento para vincular WhatsApp

- **[`/privacidad`](frontend/src/app/privacidad/page.tsx)**: página pública, deliberadamente
  **fuera** del grupo de rutas `(app)` (que exige sesión iniciada) — un aviso de privacidad
  tiene que poder consultarse antes de crear una cuenta, no solo después de haber entrado. El
  contenido legal está redactado en español conforme a la Ley Federal de Protección de Datos
  Personales en Posesión de los Particulares (LFPDPPP) de México, con un resumen en inglés al
  final que aclara que, ante cualquier discrepancia, la versión en español es la vinculante.
  Cubre: quién es responsable del tratamiento, para qué se usa específicamente la vinculación de
  WhatsApp (aclarando explícitamente que **la app no lee ni almacena el contenido de las
  conversaciones ajenas del usuario**, solo lo necesario para mandar sus propios recordatorios),
  qué datos se recaban, con quién se comparten (WhatsApp/Meta como destinatario necesario para
  entregar los mensajes, Supabase como proveedor de infraestructura — ninguno más), medidas de
  seguridad, derechos ARCO y cómo ejercerlos, y una cláusula de uso responsable (el usuario es
  responsable de no usar la vinculación para mandar spam — eso puede hacer que WhatsApp
  suspenda su número, algo ajeno a la app).
  > **Pendiente antes de publicar en producción**: el archivo tiene placeholders entre
  > corchetes (`[NOMBRE DE LA PERSONA FÍSICA O MORAL RESPONSABLE]`, `[DOMICILIO COMPLETO]`,
  > `[correo electrónico de contacto]`, fecha de última actualización) que hay que completar
  > con los datos reales de quien opera el servicio — sin eso, el aviso no cumple el requisito
  > mínimo de la LFPDPPP de identificar al responsable. No es texto de relleno decorativo, es
  > información legalmente exigida.
- **Consentimiento explícito al registrarse**: [`LoginForm.tsx`](frontend/src/components/auth/LoginForm.tsx)
  agrega, solo en modo "Crear cuenta", una casilla obligatoria ("He leído y acepto el Aviso de
  Privacidad", con link a `/privacidad` en una pestaña nueva) — el formulario no se envía a
  Supabase Auth si no está marcada. No hay manera de crear una cuenta sin haber tenido la
  oportunidad de leer el aviso primero.
- **Enlaces adicionales**: [`WhatsAppStatus.tsx`](frontend/src/components/WhatsAppStatus.tsx)
  muestra un link al aviso justo debajo del botón "Conectar WhatsApp" (el momento exacto de la
  vinculación, no antes ni después), y "Mi perfil" tiene un link permanente al final de la
  página para poder consultarlo en cualquier momento sin tener que volver a la pantalla de
  inicio de sesión.

### 4.8 Zona horaria por cuenta, vinculación por código de teléfono, recuperación de contraseña y tolerancia de envío

- **Zona horaria del número vinculado** ([`012_zona_horaria.sql`](supabase/012_zona_horaria.sql)):
  WhatsApp/Baileys no expone la zona horaria del teléfono vinculado — no es un dato del
  protocolo, así que no hay forma de "leerla" directamente. Se guarda como ajuste de cuenta en
  `profiles.zona_horaria` (texto, nombre de zona IANA como `America/Mexico_City`): se
  autodetecta **una sola vez**, a partir de la zona del navegador que está viendo la app, la
  primera vez que la sesión de WhatsApp queda `'connected'` y el perfil todavía no tiene una
  guardada ([`RequireWhatsAppConnection.tsx`](frontend/src/components/RequireWhatsAppConnection.tsx)),
  y queda editable a mano después en **Mi perfil** (selector poblado con
  `Intl.supportedValuesOf('timeZone')`, con una lista corta de respaldo si el entorno no la
  soporta) por si el dispositivo que hizo la vinculación no coincide con la zona real del
  número. Solo el propio usuario puede cambiar su zona horaria — se expone vía la RPC
  `update_own_timezone()` (`security definer`, mismo patrón que las RPCs de admin) porque la
  policy de `profiles` (sección 4.1) solo permite `UPDATE` a administradores.
  - **Dónde se usa**: [`frontend/src/lib/timezone.ts`](frontend/src/lib/timezone.ts) tiene las
    dos conversiones necesarias — `zonedTimeToUtcIso()` (fecha+hora "de pared" tal como las
    escribió el usuario → instante UTC real, para guardar) y `utcIsoToZonedParts()` (el inverso,
    para precargar el formulario al editar). No hay forma nativa de construir un `Date` "en" una
    zona horaria arbitraria — se resuelve con el mismo truco que usa `date-fns-tz` sin traer la
    librería completa: se arma una fecha candidata interpretando los números como UTC, se ve qué
    hora marcaría un reloj en esa zona para ese instante, y se corrige por la diferencia.
    [`RecordatorioForm.tsx`](frontend/src/components/agenda/RecordatorioForm.tsx) usa
    `profile.zona_horaria` (con la zona del navegador como respaldo mientras el perfil no ha
    cargado) en vez de asumir que la hora que escribió quien administra la cuenta es la hora del
    número que va a mandar el mensaje — pueden no coincidir si se administra desde otro
    dispositivo/zona.
- **Vincular por código de teléfono, alternativa al QR**
  ([`sessionManager.js`](backend/src/whatsapp/sessionManager.js),
  `requestPairingCode()`/`getPairingCode()`): pensado para quien solo tiene un dispositivo y no
  puede escanear un QR desde otro. Reusa `sock.requestPairingCode(numero)` de Baileys sobre el
  mismo socket que ya deja listo `startSession()` — WhatsApp acepta pedir el código antes de
  terminar de vincularse, igual que acepta mostrar el QR. `WhatsAppStatus.tsx` muestra un
  selector "Código QR" / "Número de teléfono" con el input de teléfono usando el mismo
  `CountryCodeSelect.tsx` (bandera + lada) que Contactos, en vez de pedir el número internacional
  completo a mano. Sigue disponible mientras `status !== 'connected'` (no solo en
  `'disconnected'`), con un botón "Solicitar nuevo código" para reintentar sin recargar la
  página. `entry.pairingCode` se limpia en cuanto la conexión pasa a `'connected'`, y también si
  `startSession()` detecta un intento realmente abandonado al arrancar uno nuevo (ver abajo).
  - **`sock.requestPairingCode()` manda su paquete de inmediato apenas se le llama** — si el
    WebSocket todavía no terminó de abrir (la ventana entre crear el socket y que abra es de
    milisegundos, pero real), Baileys lanza "Connection Closed" y el intento fallaba en silencio
    casi siempre. Se corrigió con `await sock.waitForSocketOpen()` antes de pedir el código.
  - **`creds.me` y la reconexión automática de WhatsApp a medio vincular**: tanto
    `requestPairingCode()` como el flujo de QR dejan `creds.me` seteado en las credenciales en
    cuanto se pide el código / se escanea el QR — **antes** de que el proceso termine de verdad.
    Esto es normal: `validateConnection()` (dentro de Baileys) decide mandar un handshake de
    "iniciar sesión" en vez de "registrar dispositivo nuevo" con solo mirar si `creds.me` existe,
    y de hecho **debe** tomar esa rama en la reconexión que WhatsApp fuerza justo después de un
    QR/código correcto — es el siguiente paso esperado para terminar de vincularse, no un error.
    Una primera versión de este fix no distinguía esa reconexión normal de un intento
    *realmente* abandonado (el usuario nunca terminó de escribir el código, o el backend se
    reinició a medio proceso) y borraba `creds.me` en **cada** reconexión — matando cualquier
    intento a la mitad, con QR o con código, justo cuando iba a terminar de vincularse (por eso
    ni QR ni un código recién generado funcionaban). La versión corregida agrega un parámetro
    `internal` a `startSession(userId, { internal })`: la reconexión automática que dispara el
    propio manejador de `connection.update`'s `'close'` la pasa en `true` y **nunca** limpia
    `creds.me` ahí; la limpieza de un `creds.me` viejo solo corre en un arranque genuinamente
    nuevo (`internal` por defecto en `false` — el usuario le da "Conectar"/"Obtener código" desde
    `'disconnected'`, o el proceso acaba de arrancar en `bootstrapExistingSessions()`). Como el
    `creds.me` corrupto de intentos previos al fix ya podía existir en `wa_sessions`, no hace
    falta limpiarlo a mano: se autocorrige solo la primera vez que se llama a `startSession()`
    fuera de una reconexión interna, después de desplegar este cambio.
  - **No existe un "magic link" para vincular WhatsApp**: QR y código de teléfono son los únicos
    dos mecanismos que el propio protocolo de WhatsApp expone para vincular un dispositivo
    compañero — no hay una tercera vía tipo enlace mágico por correo, es una limitación del
    protocolo, no de esta app.
  - **Esto es independiente del refresco de pestaña en segundo plano** (sección 4.6): la sesión
    de Baileys vive enteramente en el proceso del backend (Render), no en el navegador — que la
    pestaña se recargue al cambiar de app en el teléfono no toca la conexión con WhatsApp para
    nada, solo hace que `WhatsAppStatusProvider` vuelva a pedir el estado actual desde cero. Si
    la vinculación falla, la causa está del lado del backend/WhatsApp, no en que se haya
    refrescado la pantalla mientras tanto.
- **Recuperar contraseña y confirmación al registrarse**: `LoginForm.tsx` ahora exige repetir la
  contraseña al crear cuenta (bloquea el envío si no coinciden, `auth.passwordMismatch`) y
  agrega un link "¿Olvidaste tu contraseña?" en modo inicio de sesión. El flujo de recuperación
  usa Supabase Auth tal cual, sin backend propio: [`/recuperar`](frontend/src/app/recuperar/page.tsx)
  pide el correo y llama a `supabase.auth.resetPasswordForEmail(email, { redirectTo:
  '.../recuperar/nueva' })`; el correo que manda Supabase trae un enlace que, al abrirse,
  hace que el cliente de Supabase establezca una sesión temporal a partir del fragmento de la
  URL. [`/recuperar/nueva`](frontend/src/app/recuperar/nueva/page.tsx) comprueba que esa sesión
  exista (si no, el enlace es inválido o ya expiró) y, si es válida, pide la nueva contraseña dos
  veces y llama a `supabase.auth.updateUser({ password })`. Ambas páginas viven fuera del grupo
  `(app)` a propósito (no requieren estar ya autenticado con una sesión normal) — funcionan
  porque `AuthProvider`/`LanguageProvider` envuelven toda la app desde `app/layout.tsx`, no solo
  las rutas de `(app)`.
- **Tolerancia de envío de 5 minutos** (`backend/src/services/reminders.js`,
  `MAX_ATRASO_ENVIO_MS`): antes, `processPendingReminders()` mandaba cualquier recordatorio
  vencido sin importar cuánto tiempo llevara esperando — si el proceso estuvo caído un rato o el
  cron se atrasó, un recordatorio podía salir con horas de retraso sin que nadie se enterara de
  que había pasado algo raro. Ahora, antes de intentar el envío, se calcula
  `Date.now() - fecha_envio`; si excede 5 minutos, **no se manda** — se marca `fallido`
  directamente con un motivo explícito ("se excedió la tolerancia de 5 minutos de retraso...")
  en vez de silenciosamente no hacer nada o mandarlo tarde. Uno recurrente sigue el mismo camino
  que cualquier otro fallo suyo (`markFallidoRecurrenteYReprogramar`): se reprograma al siguiente
  ciclo en vez de detener la serie completa por una sola ocurrencia perdida.

Producción: desplegar en **Vercel** (plan Free) apuntando a `frontend/` como root directory,
con las mismas variables de `.env.local.example` configuradas en el dashboard.

## 5. Persistencia de la sesión de Baileys en Supabase

Baileys normalmente persiste la sesión con `useMultiFileAuthState`, que escribe archivos
JSON en disco. Eso **no sirve** en Render/Fly free: el filesystem es efímero y se borra en
cada redeploy o, en Render, cada vez que el contenedor "duerme" y vuelve a arrancar.

La solución implementada en
[`backend/src/whatsapp/supabaseAuthState.js`](backend/src/whatsapp/supabaseAuthState.js) es
un reemplazo drop-in de `useMultiFileAuthState` que usa la tabla `wa_sessions` en vez del
filesystem:

- Cada "archivo" que Baileys normalmente guardaría (`creds.json`, y una entrada por cada
  clave de sesión de Signal: `pre-key-*`, `session-*`, `sender-key-*`, `app-state-sync-key-*`)
  se guarda como una fila `(session_id, key_id, data jsonb)`.
- Los `Buffer` dentro de las credenciales (material criptográfico) se serializan con
  `BufferJSON.replacer`/`reviver` de Baileys, igual que lo hace internamente
  `useMultiFileAuthState`.
- `saveCreds()` se conecta al evento `creds.update` del socket, igual que con el adaptador
  de archivos original.
- Al reiniciar el proceso, `useSupabaseAuthState(sessionId)` lee `creds` desde Supabase; si
  existe, Baileys reconecta sin pedir QR. Si no existe (primera vez, o sesión cerrada desde
  el teléfono → `DisconnectReason.loggedOut`), se genera un QR nuevo.
- Acceso exclusivo vía `service_role key` + RLS sin policies en `wa_sessions`: ni la app
  frontend ni un usuario autenticado normal pueden leer las credenciales de WhatsApp de nadie.

**`sessionId` = `user_id`**: antes de la sesión multi-usuario existía un único
`WHATSAPP_SESSION_ID` fijo (ej. `"default"`) compartido por todo el sistema. Ahora
`sessionManager.js` llama a `useSupabaseAuthState(userId)` usando el UUID de cada usuario de
Supabase Auth como `session_id` — no fue necesario ningún cambio de esquema en `wa_sessions`,
porque `session_id` ya era una columna de texto libre. Si tu proyecto tenía una fila con
`session_id = 'default'` de antes de este cambio, queda huérfana (nadie la usa ni la borra
automáticamente); puedes limpiarla a mano o ignorarla.

Con esto, el ciclo "Render duerme por inactividad → el cron lo despierta → Baileys reconecta
usando la sesión guardada de cada usuario" ocurre sin intervención humana — pero **cada
usuario necesita escanear su propio QR al menos una vez** antes de que sus recordatorios
puedan enviarse.

## 6. Internacionalización (es/en)

Implementado con un Context de React ligero (sin dependencias extra) en
[`frontend/src/i18n/LanguageProvider.tsx`](frontend/src/i18n/LanguageProvider.tsx), con
diccionarios en [`dictionaries/es.json`](frontend/src/i18n/dictionaries/es.json) y
[`dictionaries/en.json`](frontend/src/i18n/dictionaries/en.json). `useLanguage()` expone
`{ locale, t, setLocale }`; el botón de
[`LanguageSwitcher`](frontend/src/components/LanguageSwitcher.tsx) alterna entre idiomas en
tiempo real. Para agregar textos nuevos, añade la misma clave a ambos JSON.

## 7. Próximos pasos sugeridos

- **Historial de recordatorios recurrentes**: hoy una fila recurrente se reprograma sobre sí
  misma (sección 4.2), así que solo se conoce el último envío (`ultimo_envio`). Si necesitas
  auditoría completa de cada ocurrencia, considera materializar cada envío como una fila en
  una tabla `recordatorios_historial` en vez de sobrescribir.
- **Renombrado completo hasta el esquema**: "Clientes" → "Contactos" hoy es solo de cara al
  usuario (sección 4.4); renombrar la tabla/columnas de Supabase es un cambio aparte, con más
  riesgo por tocar RLS y funciones existentes.
- **Editar recurrencia de un recordatorio existente**: el formulario de edición hoy solo
  cambia mensaje y próxima fecha; no permite cambiar frecuencia/fecha de fin de uno ya
  creado (hay que cancelarlo y crear uno nuevo).
- **Notificar al usuario cuando se le desactiva**: hoy `AccountStatusBanner` solo se ve si el
  usuario abre la app; podría complementarse con un correo automático (Supabase Edge
  Function + trigger en `profiles`) al cambiar `activo`.
- **Zona horaria**: `fecha_envio` se guarda en UTC (`timestamptz`) y el calendario/hora usan
  la zona horaria del navegador; si tus usuarios operan en zonas distintas a la del servidor,
  muestra explícitamente la zona horaria en la UI para evitar confusión.
- **Límite de sesiones concurrentes**: cada usuario conectado consume memoria del backend con
  su propio socket de Baileys (ver advertencia en sección 2). Si el negocio crece más allá de
  lo que aguanta un solo proceso de 512MB, considera repartir usuarios entre varias instancias
  del backend, un plan pagado con más RAM, o Evolution API.
- **Compresión de imágenes**: no hay redimensionado/compresión de las imágenes que se suben
  (sección 4.5) — se guardan tal cual (hasta 5MB) en Storage. Si los usuarios suben fotos de
  cámara sin comprimir, considera agregar compresión en el navegador antes de subir
  (evita depender de librerías nativas como `sharp` en el backend, que pesan memoria).

<!-- Agrega capturas en docs/screenshots/ -->

---

## Desarrollado por Francisco Javier Laguna

Full-stack developer · React · Vue · .NET · PHP

[GitHub](https://github.com/jlaguna553) · [LinkedIn](https://www.linkedin.com/in/francisco-javier-laguna-mondrag%C3%B3n-80a798154/) · [CV Online](https://cv-online.jlaguna553.workers.dev/v/xrdcnyej)
