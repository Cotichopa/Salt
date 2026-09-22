import { NextResponse, type NextRequest } from "next/server";
import { decrypt } from "@/lib/session";

// El proxy corre ANTES de cada página. Es un primer filtro rápido: solo mira si la
// cookie de sesión es válida (sin consultar la base). La verificación completa
// la hace src/lib/dal.ts en cada página y acción.

const publicRoutes = ["/login"];

export default async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const isPublic = publicRoutes.includes(path);
  const session = await decrypt(req.cookies.get("session")?.value);

  if (!isPublic && !session) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }
  if (isPublic && session) {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl));
  }
  return NextResponse.next();
}

// Rutas donde el proxy NO corre: /api (el webhook de WhatsApp tiene su propia
// verificación), archivos internos de Next.js e imágenes.
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|jpg|ico)$).*)"],
};
