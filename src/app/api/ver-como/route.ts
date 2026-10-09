import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { getCurrentUser, VIEW_AS_COOKIE } from "@/lib/dal";

// "Ver como": el superadmin entra a mirar la cuenta de otra persona (formulario con `userId`, desde
// Cuentas) o sale (sin `userId`, desde la barra de arriba). Es POST: un link en otra página no
// puede meterte en "ver como" sin que toques el botón (la cookie de sesión no viaja en un POST de
// otro sitio). El proxy no corre en /api: la sesión se revisa acá.
export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.redirect(new URL("/login", req.nextUrl), 303);
  const cookieStore = await cookies();
  const userId = (await req.formData().catch(() => null))?.get("userId");

  if (typeof userId !== "string" || !userId) {
    cookieStore.delete(VIEW_AS_COOKIE);
    return NextResponse.redirect(new URL("/admin/usuarios", req.nextUrl), 303);
  }
  if (me.role !== "SUPERADMIN") return new Response("No autorizado", { status: 403 });
  const target = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!target || target.id === me.id) return NextResponse.redirect(new URL("/admin/usuarios", req.nextUrl), 303);

  cookieStore.set(VIEW_AS_COOKIE, target.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 12 * 60 * 60, // si te olvidás de salir, a las 12 horas volvés a tu cuenta
  });
  // 303: después de un POST, el navegador pide la página nueva con GET
  return NextResponse.redirect(new URL("/dashboard", req.nextUrl), 303);
}
