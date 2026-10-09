import Link from "next/link";
import { after } from "next/server";
import { EyeIcon } from "lucide-react";
import { getViewedAccount, requireUser } from "@/lib/dal";
import { UserMenu } from "@/components/user-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/logo";
import { DesktopNav, MobileNav, SideNav } from "@/components/main-nav";
import { ChopWidget } from "@/components/chop/chop-widget";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { FormDefaultsProvider } from "@/components/form-defaults";
import { getPreferences } from "@/lib/services/preferences";
import { noteWebUse } from "@/lib/services/overview";
import { listTagNames } from "@/lib/services/tags";
import { ReadOnlyProvider } from "@/components/read-only";
import { Button } from "@/components/ui/button";

// Layout de todas las páginas privadas: la carpeta "(app)" entre paréntesis agrupa
// rutas sin agregar nada a la URL (/dashboard, no /app/dashboard).
// Cada página igual verifica la sesión por su cuenta (ver src/lib/dal.ts).
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const prefs = await getPreferences(user.id);
  // El superadmin mirando la cuenta de otra persona: barra arriba, sin botones de cambiar y sin Chop
  const viewed = await getViewedAccount();
  // Las etiquetas que sugiere el formulario de gasto: las de la cuenta que se está viendo
  const tagNames = await listTagNames(viewed?.id ?? user.id);
  // "Último uso de la web" (lo ve el superadmin): se anota después de mandar la página, sin demorarla
  after(() => noteWebUse(user.id));

  return (
    // En la compu (lg), el menú es una barra a la izquierda y el header de arriba no se muestra.
    // El contenido crece hasta max-w-7xl (≈1280 px); en el celular y la tablet, hasta max-w-5xl como antes.
    <div className="flex flex-1">
      <SideNav role={user.role} name={user.name} email={user.email} />
      <div className="flex min-w-0 flex-1 flex-col">
        {viewed && (
          <div className="bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-100">
            <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2 text-sm lg:max-w-7xl lg:px-8">
              <EyeIcon className="size-4 shrink-0" />
              <p className="flex-1">
                Viendo la cuenta de <strong>{viewed.name}</strong> · solo lectura
              </p>
              <form action="/api/ver-como" method="post">
                <Button type="submit" size="sm" variant="outline" className="bg-transparent">
                  Salir
                </Button>
              </form>
            </div>
          </div>
        )}
        <header className="border-b lg:hidden">
          <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-4 md:gap-4">
            <MobileNav role={user.role} />
            <Link href="/dashboard" className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
              <Logo className="size-5" />
              Salt
            </Link>
            <DesktopNav role={user.role} />
            {/* En el celular no hay fila de links: este espacio empuja los botones a la derecha */}
            <div className="flex-1 md:hidden" />
            <ThemeToggle />
            <UserMenu name={user.name} email={user.email} />
          </div>
        </header>
        {/* pb-24: espacio abajo para que el botón de Chop no tape lo último de la página */}
        <main className="mx-auto w-full max-w-5xl flex-1 p-4 pb-24 lg:max-w-7xl lg:px-8 lg:pt-6">
          <ReadOnlyProvider value={!!viewed}>
            <FormDefaultsProvider
              value={{ paymentMethod: prefs.defaultPaymentMethod, dollarType: prefs.defaultDollarType, tags: tagNames }}
            >
              {children}
            </FormDefaultsProvider>
          </ReadOnlyProvider>
        </main>
      </div>
      {!viewed && <ChopWidget userId={user.id} name={user.name} />}
      <KeyboardShortcuts role={user.role} readOnly={!!viewed} />
    </div>
  );
}
