import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { formatMonth, todayISO } from "@/lib/format";
import { shiftMonth } from "@/lib/services/card-statements";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { resumenHref, type Seccion } from "./sections";

// Las flechas de mes: van solo al lado de lo que cambia con el mes
export function MonthNav({ month, seccion }: { month: string; seccion: Seccion }) {
  const navButton = buttonVariants({ variant: "outline", size: "icon" });
  return (
    <div className="flex items-center gap-1">
      <Link href={resumenHref(seccion, shiftMonth(month, -1))} className={navButton} aria-label="Mes anterior">
        <ChevronLeftIcon />
      </Link>
      <span className="min-w-36 text-center text-sm font-medium">{formatMonth(month)}</span>
      {month === todayISO().slice(0, 7) ? (
        <span className={cn(navButton, "pointer-events-none opacity-50")} aria-hidden>
          <ChevronRightIcon />
        </span>
      ) : (
        <Link href={resumenHref(seccion, shiftMonth(month, 1))} className={navButton} aria-label="Mes siguiente">
          <ChevronRightIcon />
        </Link>
      )}
    </div>
  );
}
