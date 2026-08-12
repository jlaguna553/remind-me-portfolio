'use client';

interface Slice {
  label: string;
  value: number;
  color: string;
}

interface Props {
  data: Slice[];
  emptyLabel: string;
}

/**
 * Gráfica de pastel sin ninguna librería externa: un div circular con
 * conic-gradient (soportado en todos los navegadores evergreen) en vez de
 * calcular arcos de SVG a mano — mucho menos código para el mismo
 * resultado visual, consistente con el resto de la app (EmojiPicker,
 * CategoriaAutocomplete, etc. también son propios en vez de traer una
 * dependencia para algo así de puntual).
 */
export default function PieChart({ data, emptyLabel }: Props) {
  const total = data.reduce((sum, s) => sum + s.value, 0);

  if (total === 0) {
    return (
      <div className="flex items-center gap-4">
        <div className="h-32 w-32 shrink-0 rounded-full bg-slate-100" />
        <p className="text-sm text-slate-400">{emptyLabel}</p>
      </div>
    );
  }

  let acc = 0;
  const stops = data
    .filter((s) => s.value > 0)
    .map((s) => {
      const start = (acc / total) * 360;
      acc += s.value;
      const end = (acc / total) * 360;
      return `${s.color} ${start}deg ${end}deg`;
    })
    .join(', ');

  return (
    <div className="flex items-center gap-4">
      <div
        className="h-32 w-32 shrink-0 rounded-full"
        style={{ background: `conic-gradient(${stops})` }}
        role="img"
      />
      <ul className="min-w-0 flex-1 space-y-1 text-sm">
        {data.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="truncate text-slate-600">{s.label}</span>
            <span className="ml-auto shrink-0 font-medium text-slate-900">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
