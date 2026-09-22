import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { UserMenu } from "@/components/user-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/logo";

// Layout de todas las páginas privadas: la carpeta "(app)" entre paréntesis agrupa
// rutas sin agregar nada a la URL (/dashboard, no /app/dashboard).
// Cada página igual verifica la sesión por su cuenta (ver src/lib/dal.ts).
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();

  const links = [
    { href: "/dashboard", label: "Inicio" },
    { href: "/gastos", label: "Gastos" },
    { href: "/categorias", label: "Categorías" },
    { href: "/medios", label: "Tarjetas" },
    ...(user.role === "ADMIN" ? [{ href: "/admin/usuarios", label: "Cuentas" }] : []),
  ];

  return (
    <>
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4">
          <Link href="/dashboard" className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
            <Logo className="size-5" />
            Salt
          </Link>
          <nav className="flex flex-1 gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="shrink-0 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <ThemeToggle />
          <UserMenu name={user.name} email={user.email} />
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 p-4">{children}</main>
    </>
  );
}
