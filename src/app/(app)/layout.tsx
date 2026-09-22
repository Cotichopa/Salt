import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { UserMenu } from "@/components/user-menu";

// Layout de todas las páginas privadas: la carpeta "(app)" entre paréntesis agrupa
// rutas sin agregar nada a la URL (/dashboard, no /app/dashboard).
// Cada página igual verifica la sesión por su cuenta (ver src/lib/dal.ts).
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();

  const links = [
    { href: "/dashboard", label: "Inicio" },
    ...(user.role === "ADMIN" ? [{ href: "/admin/usuarios", label: "Cuentas" }] : []),
  ];

  return (
    <>
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4">
          <Link href="/dashboard" className="font-semibold">
            🧂 Salt
          </Link>
          <nav className="flex flex-1 gap-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <UserMenu name={user.name} email={user.email} />
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 p-4">{children}</main>
    </>
  );
}
