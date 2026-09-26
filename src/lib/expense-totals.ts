import type { ExpenseDTO } from "@/lib/services/expenses";

// Archivo común (sin "use client" ni "server-only"): lo usan la página de Gastos, que corre en el
// servidor, y la lista de cada categoría, que corre en el navegador.

/**
 * Total en pesos (los dólares convertidos con la cotización de su día) y cuántos dólares incluye.
 * Los gastos viejos en USD que no se convirtieron no suman a los pesos.
 */
export function totalInPesos(expenses: ExpenseDTO[]) {
  let ars = 0;
  let usd = 0;
  for (const e of expenses) {
    ars += e.amountArs ?? 0;
    if (e.currency === "USD") usd += e.amount;
  }
  return { ars, usd };
}
