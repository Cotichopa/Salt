import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { UserMenu } from "@/components/user-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/logo";
import { DesktopNav, MobileNav } from "@/components/main-nav";
import { ChopWidget } from "@/components/chop/chop-widget";

// Layout de todas las páginas privadas: la carpeta "(app)" entre paréntesis agrupa
// rutas sin agregar nada a la URL (/dashboard, no /app/dashboard).
// Cada página igual verifica la sesión por su cuenta (ver src/lib/dal.ts).
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";

  return (
    <>
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-4 md:gap-4">
          <MobileNav isAdmin={isAdmin} />
          <Link href="/dashboard" className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
            <Logo className="size-5" />
            Salt
          </Link>
          <DesktopNav isAdmin={isAdmin} />
          {/* En el celular no hay fila de links: este espacio empuja los botones a la derecha */}
          <div className="flex-1 md:hidden" />
          <ThemeToggle />
          <UserMenu name={user.name} email={user.email} />
        </div>
      </header>
      {/* pb-24: espacio abajo para que el botón de Chop no tape lo último de la página */}
      <main className="mx-auto w-full max-w-5xl flex-1 p-4 pb-24">{children}</main>
      <ChopWidget userId={user.id} name={user.name} />
    </>
  );
}
