// Service worker de Salt: con esto el navegador reconoce a Salt como app instalable.
// No guarda nada en caché (la app siempre pide los datos al servidor): el "fetch" vacío
// deja pasar cada pedido tal cual. Más adelante, acá se pueden recibir notificaciones push.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
