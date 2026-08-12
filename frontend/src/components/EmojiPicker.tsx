'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  onSelect: (emoji: string) => void;
  ariaLabel: string;
}

// Lista curada de emojis comunes para mensajes de recordatorio — evita
// depender de una librería de emoji-picker (peso extra) o del picker nativo
// del sistema operativo (inconsistente entre dispositivos).
const EMOJIS = [
  '😀', '😃', '😄', '😁', '😊', '🙂', '😉', '😍', '🥰', '😘',
  '😎', '🤔', '😅', '😢', '😭', '😴', '🤗', '🙌', '👏', '👍',
  '👎', '🙏', '💪', '✋', '👋', '❤️', '💛', '💚', '💙', '💜',
  '🧡', '⭐', '✨', '🔥', '🎉', '🎊', '🎁', '🎂', '🎈', '📅',
  '⏰', '⌚', '📌', '✅', '❌', '⚠️', '❗', '❓', '💬', '📢',
  '📞', '📱', '💰', '💵', '🧾', '📦', '🚗', '🏠', '☕', '🍕',
];

/**
 * Selector de emojis simple, sin dependencias externas. Emite el emoji
 * elegido vía onSelect y deja que el padre decida dónde insertarlo (ej. en
 * la posición del cursor de un textarea) porque solo el padre conoce ese
 * estado de selección.
 */
export default function EmojiPicker({ onSelect, ariaLabel }: Props) {
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

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-base hover:bg-slate-50"
      >
        😊
      </button>

      {open && (
        <div className="absolute right-0 z-10 mt-1 grid w-64 grid-cols-8 gap-1 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
          {EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                onSelect(emoji);
                setOpen(false);
              }}
              className="flex h-7 w-7 items-center justify-center rounded text-lg hover:bg-slate-100"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
