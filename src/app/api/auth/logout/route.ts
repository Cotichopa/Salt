import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/dal";
import { deleteSession } from "@/lib/session";

// Borra la cookie y manda al login. La usa el DAL cuando la cookie es válida pero
// la cuenta ya no (desactivada o borrada): sin esto el proxy y la página se
// mandarían de una a otra en un bucle infinito.
// Si la sesión todavía vale, no se toca: es un GET, y cualquier otra página podría cerrarte la sesión
// con un link o una imagen escondida. Para salir de verdad está el botón (la acción logout, un POST).
//
// Redirección con ruta relativa (solo "/login", sin nombrar el servidor): en /api el proxy no corre,
// así que armar la URL con el host del pedido ponía la dirección interna de la VM (0.0.0.0:3001) en el
// encabezado Location. Con una ruta relativa el navegador la resuelve contra el dominio real y no se
// filtra nada.
const redirectTo = (path: string) => new NextResponse(null, { status: 307, headers: { Location: path } });

export async function GET() {
  if (await getCurrentUser()) return redirectTo("/");
  await deleteSession();
  return redirectTo("/login");
}
