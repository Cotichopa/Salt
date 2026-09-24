import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/dal";
import { expensesToCsv } from "@/lib/csv";
import { todayISO } from "@/lib/format";
import { findExpenses } from "../query";

// GET /gastos/exportar?mes=...&q=...: descarga como CSV todos los gastos que cumplen los
// mismos filtros que la pantalla de Gastos (todas las páginas, no solo la que estás viendo).
export async function GET(request: NextRequest) {
  const user = await requireUser();
  const params = Object.fromEntries(request.nextUrl.searchParams);
  const expenses = await findExpenses(user.id, params, todayISO());

  return new Response(expensesToCsv(expenses), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      // attachment = que el navegador lo descargue en vez de mostrarlo
      "Content-Disposition": `attachment; filename="gastos-${todayISO()}.csv"`,
    },
  });
}
