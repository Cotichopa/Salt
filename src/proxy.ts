import { NextResponse, type NextRequest } from "next/server";
import { decrypt, renewedSession } from "@/lib/session";
import { contentSecurityPolicy } from "@/lib/csp";

// El proxy corre ANTES de cada página. Es un primer filtro rápido: solo mira si la
// cookie de sesión es válida (sin consultar la base). La verificación completa
// la hace src/lib/dal.ts en cada página y acción.
// También arma la Content-Security-Policy de cada página (src/lib/csp.ts), con un nonce nuevo.

// Sin sesión: el login y "olvidé mi contraseña" (/recuperar y el link del mail, /recuperar/<token>)
const publicRoutes = ["/login", "/recuperar"];

export default async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const isPublic = publicRoutes.some((route) => path === route || path.startsWith(`${route}/`));
  const token = req.cookies.get("session")?.value;
  const session = await decrypt(token);

  if (!isPublic && !session) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }
  if (isPublic && session) {
    return NextResponse.redirect(new URL("/", req.nextUrl));
  }

  // El nonce va en el pedido (Next.js lo lee de ahí para ponérselo a sus scripts, y el layout de
  // x-nonce) y en la respuesta (el navegador lo exige)
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce);
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("Content-Security-Policy", csp);

  // Usar la app renueva la sesión: solo vence si pasás 30 días sin abrirla
  const renewed = session && (await renewedSession(token));
  if (renewed) res.cookies.set(renewed.name, renewed.value, renewed.options);
  return res;
}

// Rutas donde el proxy NO corre: /api (el webhook de WhatsApp tiene su propia
// verificación), archivos internos de Next.js, imágenes, y el manifiesto y el service worker de la
// app instalable (el celular los pide sin sesión).
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|.*\\.(?:png|svg|jpg|ico)$).*)"],
};
