'use client';

interface Props {
  mensaje: string;
  imagenesUrls: string[];
  /** Nombre usado para reemplazar {{nombre}} en la vista previa. */
  nombreEjemplo: string;
  placeholder: string;
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

// WhatsApp muestra hasta 4 miniaturas en la cuadrícula y agrupa el resto
// bajo un "+N" sobre la última — igual que la vista de un álbum real.
const MAX_GRID_THUMBS = 4;

function ImageGrid({ urls }: { urls: string[] }) {
  if (urls.length === 1) {
    return <img src={urls[0]} alt="" className="max-h-56 w-full rounded-md object-cover" />;
  }

  const shown = urls.slice(0, MAX_GRID_THUMBS);
  const extra = urls.length - shown.length;

  return (
    <div className="grid grid-cols-2 gap-0.5 overflow-hidden rounded-md">
      {shown.map((url, i) => (
        <div key={`${url}-${i}`} className="relative aspect-square">
          <img src={url} alt="" className="h-full w-full object-cover" />
          {extra > 0 && i === shown.length - 1 && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-lg font-semibold text-white">
              +{extra}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Simula visualmente el mensaje saliente de WhatsApp que produciría este
 * recordatorio/plantilla. Con varias imágenes se agrupan en una sola
 * cuadrícula dentro de una sola burbuja — el backend (`sessionManager.js`,
 * `startAlbumIfNeeded`) arma un álbum real de WhatsApp cuando hay más de
 * una imagen (requiere Baileys 7.x, ver README sección 2), así que esto ya
 * no es solo una aproximación visual: es lo mismo que va a mostrar WhatsApp.
 */
export default function WhatsAppPreview({ mensaje, imagenesUrls, nombreEjemplo, placeholder }: Props) {
  const texto = mensaje.replace(/\{\{\s*nombre\s*\}\}/g, nombreEjemplo).trim();
  const now = new Date();
  const hora = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  return (
    <div className="rounded-xl bg-[#e5ddd5] p-3">
      <div className="ml-auto max-w-[85%] rounded-lg rounded-tr-none bg-[#dcf8c6] p-2 shadow-sm">
        {imagenesUrls.length > 0 && <ImageGrid urls={imagenesUrls} />}
        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-900">{texto || placeholder}</p>
        <p className="mt-1 text-right text-[10px] text-slate-500">
          {hora} <span className="text-sky-500">✓✓</span>
        </p>
      </div>
    </div>
  );
}
