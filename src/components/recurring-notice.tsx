"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { formatMoney } from "@/lib/format";
import type { LoadedRecurring } from "@/lib/services/recurring";

const shortDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

// Un solo aviso con todos los gastos fijos que se acaban de cargar solos.
// No dibuja nada: solo muestra la notificación cuando la página trae algo cargado.
export function RecurringNotice({ items }: { items: LoadedRecurring[] }) {
  useEffect(() => {
    if (items.length === 0) return;
    const title =
      items.length === 1 ? "Se cargó 1 gasto fijo" : `Se cargaron ${items.length} gastos fijos`;
    // El id evita que el mismo aviso salga dos veces (en desarrollo React corre los efectos dos veces)
    toast.success(title, {
      id: `fijos-${items.map((i) => `${i.description}${i.date}`).join("|")}`,
      duration: 10_000,
      description: (
        <ul>
          {items.map((i, n) => (
            <li key={n}>
              {i.description}: {formatMoney(i.amount, i.currency)} ({shortDate(i.date)})
            </li>
          ))}
        </ul>
      ),
    });
  }, [items]);

  return null;
}
