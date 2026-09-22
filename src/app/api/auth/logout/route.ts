import { NextResponse, type NextRequest } from "next/server";
import { deleteSession } from "@/lib/session";

// Borra la cookie y manda al login. La usa el DAL cuando la cookie es válida pero
// la cuenta ya no (desactivada o borrada): sin esto el proxy y la página se
// mandarían de una a otra en un bucle infinito.
export async function GET(req: NextRequest) {
  await deleteSession();
  return NextResponse.redirect(new URL("/login", req.nextUrl));
}
