import Link from 'next/link';

export const metadata = {
  title: 'Aviso de Privacidad — Remind-me',
};

/**
 * Página pública (fuera del grupo de rutas `(app)`, que exige sesión
 * iniciada) a propósito: un aviso de privacidad tiene que poder
 * consultarse ANTES de crear una cuenta, no solo después.
 *
 * El contenido legal está en español porque el marco de referencia es la
 * Ley Federal de Protección de Datos Personales en Posesión de los
 * Particulares (LFPDPPP) de México — el idioma en el que la ley exige que
 * el aviso esté disponible para el titular de los datos. El resumen en
 * inglés de más abajo es solo orientativo; en caso de discrepancia, aplica
 * la versión en español.
 *
 * OJO: los datos entre corchetes (nombre del responsable, domicilio,
 * correo de contacto) son placeholders — hay que completarlos con los
 * datos reales del negocio/persona responsable antes de publicar esto en
 * producción. Sin esos datos, el aviso no cumple los requisitos mínimos
 * de la LFPDPPP (identidad y domicilio del responsable).
 */
export default function PrivacidadPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4 text-sm leading-relaxed text-slate-700 sm:p-6">
      <div>
        <Link href="/" className="text-sm font-medium text-emerald-600 hover:text-emerald-700">
          ← Volver
        </Link>
      </div>

      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-slate-900">Aviso de Privacidad</h1>
        <p className="text-xs text-slate-400">Última actualización: [DD de mes de AAAA]</p>
      </header>

      <section className="space-y-2">
        <p>
          El presente Aviso de Privacidad regula el tratamiento de los datos personales de quienes
          crean una cuenta en <strong>Remind-me</strong> (en adelante, "la Aplicación") y, en
          particular, de quienes deciden <strong>vincular su número de WhatsApp</strong> a su
          cuenta para agendar y enviar recordatorios. Se emite en cumplimiento de la Ley Federal de
          Protección de Datos Personales en Posesión de los Particulares y su Reglamento.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">I. Responsable del tratamiento</h2>
        <p>
          <strong>[NOMBRE DE LA PERSONA FÍSICA O MORAL RESPONSABLE]</strong>, con domicilio en{' '}
          <strong>[DOMICILIO COMPLETO]</strong>, es responsable del tratamiento de los datos
          personales que se recaban a través de la Aplicación. Para cualquier duda, solicitud o
          ejercicio de derechos relacionados con este aviso, puede contactarse a través de{' '}
          <strong>[correo electrónico de contacto]</strong>.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">
          II. Para qué se utiliza la vinculación de su cuenta de WhatsApp
        </h2>
        <p>
          Al vincular su número desde "Mi perfil" (escaneando un código QR con su teléfono), la
          Aplicación abre una sesión de WhatsApp Web a nombre de ese número, usando el protocolo
          de WhatsApp Web (a través de la librería de código abierto Baileys) — el mismo mecanismo
          que usa WhatsApp Web/Desktop oficial, sin pasar por un tercero para leer sus mensajes.
          Esa sesión se usa <strong>exclusivamente</strong> para:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Enviar, desde <strong>su propio número</strong> (nunca desde un número compartido con
            otros usuarios de la Aplicación), los mensajes de recordatorio que usted mismo
            programa dentro de la Aplicación.
          </li>
          <li>
            Si usted lo solicita expresamente, leer su libreta de contactos y/o la lista de grupos
            en los que participa, únicamente para ofrecerle importarlos como contactos dentro de
            la Aplicación.
          </li>
          <li>
            Confirmar que un mensaje enviado por usted a través de la Aplicación fue entregado
            (estado de "enviado"/"fallido"), consultando únicamente el estado de esos mensajes,
            no su contenido.
          </li>
        </ul>
        <p>
          <strong>
            La Aplicación no lee, procesa ni almacena el contenido de sus conversaciones de
            WhatsApp ajenas a los mensajes que usted mismo programa y envía desde aquí.
          </strong>{' '}
          No hay acceso a chats, llamadas, estados/historias, ni a los mensajes que reciba de
          terceros.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">III. Datos personales que se recaban</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Datos de la cuenta</strong>: correo electrónico y contraseña (gestionados y
            resguardados por Supabase Auth; la Aplicación nunca almacena su contraseña en texto
            plano).
          </li>
          <li>
            <strong>Datos de la vinculación de WhatsApp</strong>: su número de teléfono, y las
            credenciales criptográficas de la sesión de WhatsApp Web (claves del protocolo Signal)
            necesarias para mantenerla activa sin tener que volver a escanear el código QR en cada
            uso.
          </li>
          <li>
            <strong>Contactos</strong>: los que usted registra manualmente (nombre, teléfono,
            categoría) o los que decide importar desde su libreta de WhatsApp/grupos.
          </li>
          <li>
            <strong>Recordatorios</strong>: el texto de sus mensajes y plantillas, las imágenes que
            adjunte, la fecha/hora programada, y el estado e historial de cada envío.
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">IV. Finalidades del tratamiento</h2>
        <p>
          Sus datos se usan <strong>únicamente</strong> para operar el servicio que usted solicita:
          autenticar su cuenta, enviar los recordatorios que programa desde el número que vincula,
          y mostrarle el historial de sus propios envíos. No se utilizan para publicidad dirigida,
          elaboración de perfiles con fines comerciales ajenos al servicio, ni se venden o rentan a
          terceros.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">V. Transferencia de datos</h2>
        <p>Sus datos se comparten únicamente con:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>WhatsApp/Meta Platforms, Inc.</strong>, como destinatario necesario para poder
            entregar los mensajes que usted programa — esto ocurre siempre que usa WhatsApp, con o
            sin esta Aplicación.
          </li>
          <li>
            <strong>Supabase, Inc.</strong>, como proveedor de la infraestructura de base de datos y
            autenticación sobre la que corre la Aplicación (encargado del tratamiento, no un
            tercero con fines propios sobre sus datos).
          </li>
        </ul>
        <p>No se realizan otras transferencias de datos personales a terceros.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">VI. Medidas de seguridad</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Cada cuenta solo puede ver y modificar sus propios datos (reglas de seguridad a nivel de base de datos, no solo en la interfaz).</li>
          <li>Toda la comunicación entre su dispositivo y la Aplicación viaja cifrada (HTTPS/WSS).</li>
          <li>Las credenciales de su sesión de WhatsApp solo son accesibles desde el servidor que envía sus mensajes, nunca desde el navegador de otro usuario.</li>
          <li>Su contraseña de la cuenta la gestiona Supabase Auth con métodos estándar de hash — nadie en el equipo puede verla.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">VII. Derechos ARCO y cómo ejercerlos</h2>
        <p>
          Usted tiene derecho a Acceder, Rectificar y Cancelar sus datos personales, así como a
          Oponerse al tratamiento de los mismos ("derechos ARCO"), y a revocar el consentimiento
          que en su caso haya otorgado. Muchos de estos derechos los puede ejercer usted mismo,
          directamente en la Aplicación:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Editar o eliminar sus contactos y recordatorios desde sus respectivos módulos.</li>
          <li>Desvincular su número de WhatsApp en cualquier momento desde "Mi perfil" (esto pausa automáticamente sus recordatorios pendientes).</li>
        </ul>
        <p>
          Para solicitar el acceso, rectificación o eliminación completa de su cuenta y todos sus
          datos asociados, o para revocar su consentimiento, escriba a{' '}
          <strong>[correo electrónico de contacto]</strong>. Atenderemos su solicitud en los plazos
          que marca la ley.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">
          VIII. Uso responsable de la vinculación de WhatsApp
        </h2>
        <p>
          La vinculación descrita en este aviso usa el protocolo de WhatsApp Web y no la API oficial
          de WhatsApp Business. Es responsabilidad exclusiva de quien vincula su número usar la
          Aplicación conforme a los Términos de Servicio de WhatsApp — en particular, no enviar
          mensajes masivos no solicitados ("spam"). El envío de mensajes de forma abusiva puede
          resultar en que WhatsApp suspenda o restrinja el número vinculado; esa consecuencia es
          ajena a la Aplicación y corre por cuenta del usuario que hizo un uso indebido del
          servicio.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">IX. Cookies y tecnologías similares</h2>
        <p>
          La Aplicación solo usa el almacenamiento local del navegador necesario para mantener su
          sesión iniciada. No se usan cookies de rastreo publicitario ni herramientas de analítica
          de terceros.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">X. Menores de edad</h2>
        <p>Este servicio no está dirigido a menores de edad y no se recaban datos de menores a sabiendas.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">XI. Cambios a este aviso</h2>
        <p>
          Cualquier cambio a este Aviso de Privacidad se publicará en esta misma página, indicando
          la fecha de la última actualización. Le recomendamos consultarla periódicamente.
        </p>
      </section>

      <hr className="border-slate-200" />

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">English summary</h2>
        <p className="text-slate-500">
          This is an informational summary only — the Spanish version above is the legally binding
          Aviso de Privacidad under Mexican data protection law (LFPDPPP). In case of any
          discrepancy, the Spanish version prevails.
        </p>
        <p>
          When you link your WhatsApp number from "My profile," the app opens a WhatsApp Web
          session for that number (via the open-source Baileys library) solely to: (1) send, from
          your own number, the reminders you schedule inside the app; (2) if you explicitly ask,
          read your contact/group list to offer importing them; and (3) check delivery status of
          messages you send through the app. <strong>The app never reads or stores the content of
          your other WhatsApp conversations.</strong> Your account email/password, linked phone
          number, WhatsApp session credentials, contacts, and reminders (including message text
          and images) are stored in Supabase, scoped to your account only, and shared with no one
          beyond WhatsApp/Meta (to deliver your messages) and Supabase (our database provider).
          They are never sold or used for advertising. You can edit or delete your data, unlink
          WhatsApp, or request full account deletion at any time by writing to{' '}
          <strong>[contact email]</strong>. You are responsible for using the WhatsApp linking in
          compliance with WhatsApp's own Terms of Service (no unsolicited bulk messaging); misuse
          that leads to WhatsApp suspending your number is outside the app's control.
        </p>
      </section>
    </main>
  );
}
