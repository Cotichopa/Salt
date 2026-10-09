"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChartColumnIcon, CreditCardIcon, HashIcon, HouseIcon, MenuIcon, ReceiptIcon, RepeatIcon, TagIcon, UsersIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

// Menú principal, en tres formas según el ancho de la pantalla:
// - compu (desde lg, ≈1024 px): barra fija a la izquierda con íconos y texto (SideNav)
// - tablet (md): fila de links al lado del logo, en el header de arriba (DesktopNav)
// - celular: botón "hamburguesa" (☰) que abre un panel desde la izquierda (MobileNav)
// Son Client Components porque necesitan saber en qué página estás (usePathname)
// y recordar si el panel está abierto (useState).

const LINKS = [
  { href: "/dashboard", label: "Inicio", icon: HouseIcon },
  { href: "/gastos", label: "Gastos", icon: ReceiptIcon },
  { href: "/fijos", label: "Fijos", icon: RepeatIcon },
  { href: "/categorias", label: "Categorías", icon: TagIcon },
  { href: "/etiquetas", label: "Etiquetas", icon: HashIcon },
  { href: "/medios", label: "Tarjetas", icon: CreditCardIcon },
];
const ADMIN_LINKS = [{ href: "/admin/usuarios", label: "Cuentas", icon: UsersIcon }];
const SUPERADMIN_LINKS = [{ href: "/admin/resumen", label: "Resumen", icon: ChartColumnIcon }];

const linksFor = (role: string) =>
  role === "SUPERADMIN" ? [...LINKS, ...ADMIN_LINKS, ...SUPERADMIN_LINKS] : role === "ADMIN" ? [...LINKS, ...ADMIN_LINKS] : LINKS;

/** true si estás en esa sección o en una de sus subpáginas (/categorias/123) */
const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

/** Celular: botón ☰ que abre un panel lateral con todas las secciones */
export function MobileNav({ role }: { role: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const links = linksFor(role);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="ghost" size="icon" className="md:hidden" aria-label="Abrir menú" />}>
        <MenuIcon />
      </SheetTrigger>
      <SheetContent side="left" className="w-72 gap-0">
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2 font-display text-lg">
            <Logo className="size-5" />
            Salt
          </SheetTitle>
          <SheetDescription className="sr-only">Secciones de la aplicación</SheetDescription>
        </SheetHeader>
        <nav className="flex flex-col gap-1 p-3">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              aria-current={isActive(pathname, href) ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-base text-muted-foreground hover:bg-muted hover:text-foreground",
                isActive(pathname, href) && "bg-muted font-medium text-foreground",
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}

/** Tablet: fila de links al lado del logo (en el celular no se muestra, y en la compu está SideNav) */
export function DesktopNav({ role }: { role: string }) {
  const pathname = usePathname();
  const links = linksFor(role);

  return (
    // Si no entran todos (cuenta de admin en una tablet angosta), la fila se desliza de costado y los
    // botones de la derecha (tema y cuenta) siempre se ven
    <nav className="hidden min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none] md:flex lg:hidden">
      {links.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(pathname, href) ? "page" : undefined}
          className={cn(
            "shrink-0 rounded-md px-3 py-1.5 text-sm whitespace-nowrap text-muted-foreground hover:bg-muted hover:text-foreground",
            isActive(pathname, href) && "bg-muted font-medium text-foreground",
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * Compu: barra fija a la izquierda, del alto de la pantalla (sticky: no se va al bajar).
 * Logo arriba, las secciones con ícono y texto, y abajo la persona y el tema.
 */
export function SideNav({ role, name, email }: { role: string; name: string; email: string }) {
  const pathname = usePathname();
  const links = linksFor(role);

  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground lg:flex">
      <Link href="/dashboard" className="flex h-14 items-center gap-2 px-5 font-display text-lg font-semibold tracking-tight">
        <Logo className="size-5" />
        Salt
      </Link>
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
        {links.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={isActive(pathname, href) ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              isActive(pathname, href) && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        ))}
      </nav>
      <div className="flex items-center gap-1 border-t p-3">
        <UserMenu name={name} email={email} side="top" className="min-w-0 flex-1 justify-start" />
        <ThemeToggle />
      </div>
    </aside>
  );
}
