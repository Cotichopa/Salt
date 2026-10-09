import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRightIcon, HashIcon } from "lucide-react";
import { requireAccount } from "@/lib/dal";
import { formatMoney, formatDay, isoToDate } from "@/lib/format";
import { listTags } from "@/lib/services/tags";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Etiquetas · Salt" };

// Lista de etiquetas: cuánto suma cada una (en pesos) y cuántos gastos tiene. Se crean al ponerlas en
// un gasto (formulario o Chop con "#"); acá se miran, y en cada una se renombran o borran.
export default async function TagsPage() {
  const user = await requireAccount();
  const tags = await listTags(user.id);

  return (
    <div className="flex max-w-3xl flex-col gap-4 py-2">
      <h1 className="text-2xl font-semibold">Etiquetas</h1>
      {tags.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Todavía no usaste etiquetas</CardTitle>
            <CardDescription>
              Sirven para juntar gastos de varias categorías y ver cuánto costó todo: un viaje, un cumpleaños, una obra.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
            <p>
              Al cargar o editar un gasto, escribila en <strong className="text-foreground">Etiquetas</strong> (por ejemplo{" "}
              <strong className="text-foreground">#bariloche</strong>).
            </p>
            <p>
              Con Chop, agregala al mensaje: <strong className="text-foreground">«café 3000 #bariloche»</strong>, y preguntá{" "}
              <strong className="text-foreground">«¿cuánto gasté en #bariloche?»</strong>.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col">
            {tags.map((t) => (
              <Link
                key={t.id}
                href={`/etiquetas/${t.id}`}
                className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/60"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/40">
                  <HashIcon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{t.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {t.count} {t.count === 1 ? "gasto" : "gastos"}
                    {t.lastDate && ` · el último, ${formatDay(isoToDate(t.lastDate)).toLowerCase()}`}
                  </div>
                </div>
                <span className="font-medium tabular-nums">{formatMoney(Math.round(t.total), "ARS")}</span>
                <ChevronRightIcon className="size-4 text-muted-foreground" />
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
