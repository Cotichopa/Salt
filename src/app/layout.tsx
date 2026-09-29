import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Instrument_Sans } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { ServiceWorker } from "@/components/service-worker";
import { Splash } from "@/components/splash";
import { getCurrentUser } from "@/lib/dal";
import { getPreferences } from "@/lib/services/preferences";

// Dos tipografías: una con carácter para la marca y los títulos, otra neutra para leer.
const display = Bricolage_Grotesque({ variable: "--font-display", subsets: ["latin"] });
const body = Instrument_Sans({ variable: "--font-body", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Salt",
  description: "Gastos familiares desde la web o WhatsApp",
  // Instalada en iPhone ("Agregar a inicio"): se abre como app, con este nombre bajo el ícono
  appleWebApp: { capable: true, title: "Salt", statusBarStyle: "default" },
};

// Color de la barra del celular (arriba), según el tema claro u oscuro del teléfono
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0d0d" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Color principal elegido en "Cuenta" (sin sesión, el de siempre)
  const user = await getCurrentUser();
  const accent = user ? (await getPreferences(user.id)).accentColor : "neutral";

  return (
    // suppressHydrationWarning: next-themes escribe la clase del tema antes de que React arranque
    <html
      lang="es"
      data-accent={accent}
      suppressHydrationWarning
      className={`${display.variable} ${body.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <Splash />
        <ThemeProvider>
          {children}
          <Toaster richColors position="top-center" />
          <ServiceWorker />
        </ThemeProvider>
      </body>
    </html>
  );
}
