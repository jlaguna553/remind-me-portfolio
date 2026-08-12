'use client';

import { useRef } from 'react';

interface Props {
  /** URLs a previsualizar, en orden — mezcla de imágenes ya guardadas y previews locales de archivos recién elegidos. */
  previews: string[];
  onAddFiles: (files: File[]) => void;
  onRemove: (index: number) => void;
  hint: string;
}

/**
 * Selector de varias imágenes con miniaturas y botón para quitar cada una.
 * Compartido entre RecordatorioForm y PlantillasSection — quien lo usa es
 * responsable de mantener separados "URLs ya guardadas" vs. "archivos
 * nuevos por subir" y de resolver qué índice le corresponde a cuál al
 * recibir onRemove (este componente solo sabe de la lista combinada que se
 * le pasó para mostrar).
 */
export default function ImagenesPicker({ previews, onAddFiles, onRemove, hint }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-2">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length > 0) onAddFiles(files);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }}
        className="w-full text-xs text-slate-600"
      />
      <p className="text-xs text-slate-400">{hint}</p>

      {previews.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {previews.map((url, i) => (
            <div key={`${url}-${i}`} className="relative">
              <img src={url} alt="" className="h-20 w-20 rounded-lg border border-slate-200 object-cover" />
              <button
                type="button"
                onClick={() => onRemove(i)}
                aria-label="quitar imagen"
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs leading-none text-white shadow"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
