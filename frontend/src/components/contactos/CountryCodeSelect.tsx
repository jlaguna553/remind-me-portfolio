'use client';

import { useEffect, useRef, useState } from 'react';
import { COUNTRY_CODES, type CountryCode } from '@/lib/countryCodes';

interface Props {
  value: string;
  onChange: (code: string) => void;
  ariaLabel: string;
}

/**
 * Un <select> nativo no puede mostrar algo distinto colapsado que en su
 * lista abierta (el texto de la opción seleccionada es siempre el mismo).
 * Como se pidió mostrar solo la bandera colapsado pero nombre + bandera en
 * la lista, esto es un desplegable propio en vez de un <select>.
 */
export default function CountryCodeSelect({ value, onChange, ariaLabel }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selected: CountryCode = COUNTRY_CODES.find((c) => c.code === value) ?? COUNTRY_CODES[0];

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-full items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-2 text-lg leading-none"
      >
        <span>{selected.flag}</span>
        <span className="text-xs text-slate-400">▾</span>
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute z-10 mt-1 max-h-64 w-64 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg"
        >
          {COUNTRY_CODES.map((c) => (
            <li key={c.code}>
              <button
                type="button"
                role="option"
                aria-selected={c.code === value}
                onClick={() => {
                  onChange(c.code);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-100 ${
                  c.code === value ? 'bg-emerald-50 font-medium text-emerald-700' : 'text-slate-700'
                }`}
              >
                <span className="text-base">{c.flag}</span>
                <span className="flex-1">{c.label}</span>
                <span className="text-xs text-slate-400">{c.code}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
