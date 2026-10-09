"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { KeyboardIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Atajos de teclado (para la compu). No hacen nada mientras escribís en un campo, con una ventana
// abierta o apretando Ctrl/Cmd/Alt (así no pisan los del navegador). Para "ir a" son de a dos, como
// en Gmail: G y después la letra de la sección.
//   N   gasto nuevo                 B   buscar
//   C   abrir Chop                  ?   esta lista
//   G I/G/F/C/E/T  Inicio, Gastos, Fijos, Categorías, Etiquetas, Tarjetas (+ U Cuentas y R Resumen)
// Las otras partes de la app escuchan estos "eventos" (window): el formulario de gasto nuevo
// (gastos/expense-dialog.tsx), el chat de Chop (chop-widget.tsx) y los buscadores (data-shortcut-search).

export const NEW_EXPENSE_EVENT = "salt:nuevo-gasto";
export const OPEN_CHOP_EVENT = "salt:chop";
const HELP_EVENT = "salt:atajos";
// Al ir a Gastos para buscar: el buscador se enfoca solo al llegar (lo lee expense-filters.tsx)
export const FOCUS_SEARCH_KEY = "salt:buscar";

type Go = { key: string; href: string; label: string };
const GO: Go[] = [
  { key: "i", href: "/dashboard", label: "Inicio" },
  { key: "g", href: "/gastos", label: "Gastos" },
  { key: "f", href: "/fijos", label: "Fijos" },
  { key: "c", href: "/categorias", label: "Categorías" },
  { key: "e", href: "/etiquetas", label: "Etiquetas" },
  { key: "t", href: "/medios", label: "Tarjetas" },
];
const ADMIN_GO: Go[] = [{ key: "u", href: "/admin/usuarios", label: "Cuentas" }];
const SUPERADMIN_GO: Go[] = [{ key: "r", href: "/admin/resumen", label: "Resumen" }];

const goFor = (role: string) =>
  role === "SUPERADMIN" ? [...GO, ...ADMIN_GO, ...SUPERADMIN_GO] : role === "ADMIN" ? [...GO, ...ADMIN_GO] : GO;

/** ¿Está escribiendo en un campo? (ahí las letras son letras, no atajos) */
function typing(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/** ¿Hay una ventana abierta? (el chat de Chop y los diálogos; escondidos no cuentan) */
function dialogOpen() {
  return [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')].some((el) => el.getClientRects().length > 0);
}

export function KeyboardShortcuts({ role, readOnly }: { role: string; readOnly: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [help, setHelp] = useState(false);
  // Después de apretar G, la próxima tecla dice a dónde ir (si llega en menos de 1,5 segundos)
  const waitingGo = useRef(false);
  const goTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const go = useMemo(() => goFor(role), [role]);

  useEffect(() => {
    const openHelp = () => setHelp(true);
    window.addEventListener(HELP_EVENT, openHelp);

    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target) || dialogOpen()) return;
      const key = e.key.toLowerCase();

      if (waitingGo.current) {
        waitingGo.current = false;
        clearTimeout(goTimer.current);
        const target = go.find((g) => g.key === key);
        if (target) {
          e.preventDefault();
          router.push(target.href);
        }
        return;
      }

      if (key === "g") {
        waitingGo.current = true;
        goTimer.current = setTimeout(() => (waitingGo.current = false), 1500);
      } else if (key === "n" && !readOnly) {
        e.preventDefault();
        // En Gastos se abre ahí mismo; desde otra pantalla, se va a Gastos con el formulario abierto
        if (pathname === "/gastos") window.dispatchEvent(new Event(NEW_EXPENSE_EVENT));
        else router.push("/gastos?nuevo=1");
      } else if (key === "b") {
        e.preventDefault(); // si no, la "b" se escribe en el buscador recién enfocado
        const search = [...document.querySelectorAll<HTMLInputElement>("[data-shortcut-search]")].find(
          (el) => el.getClientRects().length > 0,
        );
        if (search) search.focus();
        else {
          sessionStorage.setItem(FOCUS_SEARCH_KEY, "1");
          router.push("/gastos");
        }
      } else if (key === "c" && !readOnly) {
        e.preventDefault();
        window.dispatchEvent(new Event(OPEN_CHOP_EVENT));
      } else if (e.key === "?") {
        e.preventDefault();
        setHelp(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(HELP_EVENT, openHelp);
      window.removeEventListener("keydown", onKey);
      clearTimeout(goTimer.current);
    };
  }, [router, pathname, readOnly, go]);

  const rows: [string[], string][] = [
    ...(readOnly ? [] : [[["N"], "Gasto nuevo"] as [string[], string]]),
    [["B"], "Buscar gastos"],
    ...(readOnly ? [] : [[["C"], "Hablar con Chop"] as [string[], string]]),
    ...go.map((g): [string[], string] => [["G", g.key.toUpperCase()], `Ir a ${g.label}`]),
    [["?"], "Ver esta lista"],
  ];

  return (
    <Dialog open={help} onOpenChange={setHelp}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyboardIcon className="size-5" />
            Atajos de teclado
          </DialogTitle>
          <DialogDescription>Para ir más rápido en la compu. Los de «ir a» son de a dos: G y después la letra.</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-2 text-sm">
          {rows.map(([keys, label]) => (
            <li key={label} className="flex items-center justify-between gap-4">
              <span>{label}</span>
              <span className="flex gap-1">
                {/* key con la posición: "G G" (ir a Gastos) repite la letra */}
                {keys.map((k, i) => (
                  <kbd key={i} className="min-w-6 rounded-md border bg-muted px-1.5 py-0.5 text-center font-mono text-xs">
                    {k}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

/** "Atajos: ?" chiquito, para el menú lateral: abre la lista */
export function ShortcutsHint() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(HELP_EVENT))}
      className="flex items-center gap-2 rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    >
      <KeyboardIcon className="size-3.5" />
      Atajos:
      <kbd className="rounded border bg-muted px-1 font-mono">?</kbd>
    </button>
  );
}
