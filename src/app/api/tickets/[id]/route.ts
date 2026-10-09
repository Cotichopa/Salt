import type { NextRequest } from "next/server";
import { getCurrentUser, getViewedAccount } from "@/lib/dal";
import { getReceipt } from "@/lib/services/receipts";

// La foto de un ticket (/api/tickets/<id>), para verla en la web. Solo se la muestra a su dueño (o al
// superadmin mientras mira esa cuenta): el proxy no corre en /api, así que la sesión se revisa acá.
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/tickets/[id]">) {
  const user = await getCurrentUser();
  if (!user) return new Response("No autorizado", { status: 401 });
  const { id } = await ctx.params;
  const account = (await getViewedAccount()) ?? user;
  const receipt = await getReceipt(account.id, id);
  if (!receipt) return new Response("No encontrado", { status: 404 });
  return new Response(new Uint8Array(receipt.data), {
    headers: {
      "Content-Type": receipt.mimeType,
      // Una foto nunca cambia: el navegador la guarda (solo para esta persona)
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
