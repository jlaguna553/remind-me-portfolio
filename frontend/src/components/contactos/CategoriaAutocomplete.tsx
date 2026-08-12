'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

interface Props {
  value: string;
  onChange: (value: string) => void;
  categorias: string[];
  placeholder?: string;
}

/**
 * Campo de texto libre para categoría, con sugerencias de categorías ya
 * usadas que se filtran según lo que se va escribiendo. Antes usaba un
 * <input list="..."> (datalist nativo): deja escribir cualquier cosa, pero
 * el ícono de flecha que agrega el navegador lo hace ver como un <select>
 * de opciones cerradas, y su UI de sugerencias no es consistente entre
 * navegadores. Este combobox propio deja escribir libremente y muestra la
 * lista de coincidencias debajo, igual que CountryCodeSelect/EmojiPicker.
 */
export default function CategoriaAutocomplete({ value, onChange, categorias, placeholder }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const sugerencias = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return categorias;
    return categorias.filter((c) => c.toLowerCase() !== q && c.toLowerCase().includes(q));
  }, [value, categorias]);

  return (
    <div ref={containerRef} className="relative">
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
      />

      {open && sugerencias.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-40 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
          {sugerencias.map((c) => (
            <li key={c}>
              <button
                type="button"
                onClick={() => {
                  onChange(c);
                  setOpen(false);
                }}
                className="block w-full rounded-md px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100"
              >
                {c}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
