// Content-Security-Policy: le dice al navegador de dónde puede cargar cada cosa. Lo importante son los
// scripts: solo corren los que llevan el "nonce" de este pedido (un código al azar que arma el proxy en
// cada página; Next.js se lo pone solo a los suyos, y la animación de inicio y el tema lo reciben del
// layout). Si algún día alguien lograra meter un <script> en una página (XSS), no tendría el nonce y el
// navegador no lo correría. 'strict-dynamic': los scripts con nonce pueden cargar otros (los pedazos
// de la app que Next.js baja a medida que se usan).
//
// Los estilos sí van sueltos ('unsafe-inline'): los gráficos, los avisos y los colores de cada
// categoría los usan, y un estilo no puede ejecutar código.

export function contentSecurityPolicy(nonce: string) {
  const dev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    // En desarrollo React usa eval para mostrar dónde falló el servidor; en producción no
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    // Fotos de tickets (/api/tickets), las achicadas en el navegador (blob:) y los íconos en data:
    "img-src 'self' blob: data:",
    "media-src 'self' blob:", // audios grabados en el chat de Chop
    "font-src 'self'", // next/font las sirve desde Salt
    "connect-src 'self'",
    "worker-src 'self' blob:", // el service worker de la app instalable (sw.js)
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'", // ninguna otra página puede mostrar Salt adentro (como X-Frame-Options)
    // En producción todo va por HTTPS; en desarrollo se entra por http://192.168... desde el celular
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}
