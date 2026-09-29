import type { MetadataRoute } from "next";

// Manifiesto de la app: con esto el celular deja "instalar" Salt como una app (ícono en la pantalla
// de inicio y sin la barra del navegador). Se sirve en /manifest.webmanifest.
// En Android: Chrome → menú ⋮ → "Instalar app". En iPhone: Safari → Compartir → "Agregar a inicio".
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Salt",
    short_name: "Salt",
    description: "Gastos familiares desde la web o WhatsApp",
    lang: "es-AR",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0d0d0d",
    theme_color: "#0d0d0d",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Con más margen: Android lo recorta en círculo, gota, etc.
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
