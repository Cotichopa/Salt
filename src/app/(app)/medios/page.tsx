import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import { requireUser } from "@/lib/dal";
import { formatMoney } from "@/lib/format";
import { listWithUsage } from "@/lib/services/payment-sources";
import { getStatement, statementToShow, type Statement } from "@/lib/services/card-statements";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PaymentSourceDialog } from "./payment-source-dialog";
import { DeleteSourceButton } from "./delete-source-button";

export const metadata: Metadata = { title: "Tarjetas · Salt" };

const shortDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

type Source = Awaited<ReturnType<typeof listWithUsage>>[number];

/** Tarjeta tocable: lleva a su pantalla (/medios/<id>) con el resumen */
function CardLink({ s, statement }: { s: Source; statement: Statement | null }) {
  return (
    <Link href={`/medios/${s.id}`} className="-mx-2 flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/60">
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{s.name}</div>
        <div className="text-sm text-muted-foreground">
          {!statement
            ? "Poné el día de cierre para ver el resumen"
            : statement.status === "a pagar"
              ? `A pagar · vence el ${shortDate(statement.due)}`
              : `Resumen abierto · cierra el ${shortDate(statement.closing)}`}
        </div>
      </div>
      {statement && (
        <div className="text-right">
          <div className="font-medium tabular-nums">{formatMoney(statement.total, "ARS")}</div>
          {statement.usd > 0 && (
            <div className="text-xs text-muted-foreground">incluye {formatMoney(statement.usd, "USD")}</div>
          )}
        </div>
      )}
      <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

export default async function PaymentSourcesPage() {
  const user = await requireUser();
  const sources = await listWithUsage(user.id);

  // De cada tarjeta con el cierre configurado: el resumen a pagar o, si no hay, el abierto
  const statements = new Map<string, Statement>();
  await Promise.all(
    sources
      .filter((s) => s.kind === "CARD" && s.closingDay)
      .map(async (s) => {
        const month = await statementToShow(user.id, s.id);
        const statement = month ? await getStatement(user.id, s.id, month) : null;
        if (statement?.configured) statements.set(s.id, statement);
      }),
  );

  const groups = [
    { kind: "CARD" as const, title: "Tarjetas", hint: "Aparecen al pagar con débito o crédito. Tocá una para ver su resumen." },
    { kind: "WALLET" as const, title: "Billeteras y bancos", hint: "Aparecen al pagar por transferencia." },
  ];

  return (
    <div className="flex flex-col gap-6 py-2">
      <h1 className="text-2xl font-semibold">Tarjetas y billeteras</h1>

      {groups.map((group) => {
        const items = sources.filter((s) => s.kind === group.kind);
        return (
          <Card key={group.kind}>
            <CardHeader>
              <CardTitle>{group.title}</CardTitle>
              <CardDescription>{group.hint}</CardDescription>
              {group.kind === "CARD" && (
                <CardAction>
                  <PaymentSourceDialog />
                </CardAction>
              )}
            </CardHeader>
            <CardContent className="flex flex-col divide-y">
              {items.length === 0 && (
                <p className="py-4 text-center text-muted-foreground">Todavía no agregaste ninguna.</p>
              )}
              {items.map((s) => (
                <div key={s.id} className="flex items-center gap-1 py-1">
                  {s.kind === "CARD" ? (
                    <CardLink s={s} statement={statements.get(s.id) ?? null} />
                  ) : (
                    <div className="flex min-w-0 flex-1 items-baseline gap-2 py-2">
                      <span className="truncate font-medium">{s.name}</span>
                      <span className="text-sm text-muted-foreground">
                        {s.expenseCount} {s.expenseCount === 1 ? "gasto" : "gastos"}
                      </span>
                    </div>
                  )}
                  <PaymentSourceDialog source={s} />
                  <DeleteSourceButton id={s.id} name={s.name} expenseCount={s.expenseCount} />
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
