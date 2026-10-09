import { formatMoney } from "@/lib/format";

// "Comparar por categoría": en cada categoría, una barra por persona (barras agrupadas). Cada
// persona tiene siempre el mismo color, en el orden de las cuentas; las barras se miden todas
// contra la más grande, así se comparan entre categorías también. Al pasar el mouse o tocar, el
// monto; y "Ver datos" muestra la tabla (los colores 3 y 4 tienen poco contraste con el fondo
// claro: la tabla y la leyenda con nombre hacen que no dependa del color).

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-6)", "var(--chart-7)"];

type Props = {
  people: { id: string; name: string }[];
  categories: { name: string; values: number[] }[];
};

export function CompareChart({ people, categories }: Props) {
  if (categories.length === 0) return <p className="text-sm text-muted-foreground">Nadie cargó gastos este mes.</p>;
  const max = Math.max(...categories.flatMap((c) => c.values));

  return (
    <div className="flex flex-col gap-5">
      {/* Leyenda: siempre, porque hay más de una persona */}
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {people.map((p, i) => (
          <li key={p.id} className="flex items-center gap-2">
            <span className="size-3 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />
            {p.name}
          </li>
        ))}
      </ul>

      <ul className="flex flex-col gap-4">
        {categories.map((c) => (
          <li key={c.name} className="grid gap-1.5 sm:grid-cols-[10rem_1fr] sm:gap-4">
            <span className="truncate text-sm font-medium">{c.name}</span>
            <div className="flex flex-col gap-0.5">
              {people.map((p, i) => (
                // El área sensible es toda la fila (más grande que la barra), y el monto aparece al lado
                <div key={p.id} className="group flex h-3 items-center gap-2" tabIndex={0} aria-label={`${p.name}: ${formatMoney(c.values[i], "ARS")}`}>
                  <div
                    className="h-2 rounded-r-[4px]"
                    style={{
                      width: c.values[i] > 0 ? `max(${(c.values[i] / max) * 85}%, 2px)` : 0,
                      background: COLORS[i % COLORS.length],
                    }}
                  />
                  <span className="hidden text-xs whitespace-nowrap text-muted-foreground tabular-nums group-hover:inline group-focus:inline">
                    {p.name} · {formatMoney(c.values[i], "ARS")}
                  </span>
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>

      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Ver datos</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-1 font-normal">Categoría</th>
                {people.map((p) => (
                  <th key={p.id} className="py-1 text-right font-normal">
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.name} className="border-b last:border-0">
                  <td className="py-1">{c.name}</td>
                  {c.values.map((v, i) => (
                    <td key={people[i].id} className="py-1 text-right tabular-nums">
                      {formatMoney(v, "ARS")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
