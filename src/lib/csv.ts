import { paymentMethodLabels } from "@/lib/format";
import type { ExpenseDTO } from "@/lib/services/expenses";

// Excel toma como fórmula una celda que empieza con = + - @ (o tab / enter): una descripción como
// =HYPERLINK("http://...") se volvería un link. Con un apóstrofo adelante queda como texto.
// Los montos no pasan por acá con signo (siempre son positivos).
function safeCell(text: string) {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

// Gastos → CSV (se abre con Excel). Lo usan el botón Exportar de Gastos (en el servidor)
// y el de cada categoría (en el navegador).
export function expensesToCsv(expenses: ExpenseDTO[]) {
  const rows = [
    ["Fecha", "Categoría", "Descripción", "Monto", "Moneda", "Medio de pago", "Tarjeta o billetera", "Cuota", "Etiquetas", "Origen"],
    ...expenses.map((e) => [
      e.date,
      e.category.name,
      e.description ?? "",
      // Excel en español espera la coma como separador decimal
      String(e.amount).replace(".", ","),
      e.currency,
      paymentMethodLabels[e.paymentMethod],
      e.paymentSource?.name ?? "",
      e.installments > 1 ? `${e.installmentNumber}/${e.installments}` : "",
      e.tags.map((t) => `#${t.name}`).join(" "),
      e.source === "WHATSAPP" ? "WhatsApp" : "Web",
    ]),
  ];
  const csv = rows.map((r) => r.map((cell) => `"${safeCell(String(cell)).replace(/"/g, '""')}"`).join(";")).join("\n");
  // El BOM (primer carácter invisible) le avisa a Excel que el archivo está en UTF-8 (si no, rompe los acentos)
  return "﻿" + csv;
}
