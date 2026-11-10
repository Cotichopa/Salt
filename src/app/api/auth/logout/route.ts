import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/dal";
import { deleteSession } from "@/lib/session";

// Borra la cookie y manda al login. La usa el DAL cuando la cookie es válida pero
// la cuenta ya no (desactivada o borrada): sin esto el proxy y la página se
// mandarían de una a otra en un bucle infinito.
// Si la sesión todavía vale, no se toca: es un GET, y cualquier otra página podría cerrarte la sesión
// con un link o una imagen escondida. Para salir de verdad está el botón (la acción logout, un POST).
export async function GET(req: NextRequest) {
  if (await getCurrentUser()) return NextResponse.redirect(new URL("/", req.nextUrl));
  await deleteSession();
  return NextResponse.redirect(new URL("/login", req.nextUrl));
}
