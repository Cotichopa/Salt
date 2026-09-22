"use client";

import { ThemeProvider as NextThemes } from "next-themes";

// Maneja el tema claro/oscuro: agrega la clase "dark" al <html> y recuerda la elección
// en el navegador. Arranca en oscuro.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemes attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
      {children}
    </NextThemes>
  );
}
