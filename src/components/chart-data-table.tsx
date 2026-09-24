import { formatMoney, type CurrencyCode } from "@/lib/format";

// Tabla simple escondida debajo de cada gráfico: permite leer los valores exactos
// sin depender de los colores ni del mouse (accesibilidad)
export function ChartDataTable({ rows, currency }: { rows: { label: string; total: number }[]; currency: CurrencyCode }) {
  return (
    <details className="mt-2 text-sm">
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Ver datos</summary>
      <table className="mt-2 w-full">
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b last:border-0">
              <td className="py-1">{r.label}</td>
              <td className="py-1 text-right tabular-nums">{formatMoney(r.total, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
