"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CreditCardIcon, HouseIcon, MenuIcon, ReceiptIcon, TagIcon, UsersIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

// Menú principal. En la compu se ve como una fila de links al lado del logo; en el celular
// se esconde detrás de un botón "hamburguesa" (☰) que abre un panel desde la izquierda.
// Son Client Components porque necesitan saber en qué página estás (usePathname)
// y recordar si el panel está abierto (useState).

const LINKS = [
  { href: "/dashboard", label: "Inicio", icon: HouseIcon },
  { href: "/gastos", label: "Gastos", icon: ReceiptIcon },
  { href: "/categorias", label: "Categorías", icon: TagIcon },
  { href: "/medios", label: "Tarjetas", icon: CreditCardIcon },
];
const ADMIN_LINKS = [{ href: "/admin/usuarios", label: "Cuentas", icon: UsersIcon }];

/** true si estás en esa sección o en una de sus subpáginas (/categorias/123) */
const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

/** Celular: botón ☰ que abre un panel lateral con todas las secciones */
export function MobileNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const links = isAdmin ? [...LINKS, ...ADMIN_LINKS] : LINKS;

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

/** Compu: fila de links al lado del logo (en el celular no se muestra) */
export function DesktopNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const links = isAdmin ? [...LINKS, ...ADMIN_LINKS] : LINKS;

  return (
    <nav className="hidden flex-1 gap-1 md:flex">
      {links.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(pathname, href) ? "page" : undefined}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground",
            isActive(pathname, href) && "bg-muted font-medium text-foreground",
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
