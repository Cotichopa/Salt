import type { Metadata } from "next";
import { requireUser } from "@/lib/dal";
import { listWithUsage } from "@/lib/services/payment-sources";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PaymentSourceDialog } from "./payment-source-dialog";
import { DeleteSourceButton } from "./delete-source-button";

export const metadata: Metadata = { title: "Tarjetas · Salt" };

export default async function PaymentSourcesPage() {
  const user = await requireUser();
  const sources = await listWithUsage(user.id);
  const groups = [
    { kind: "CARD" as const, title: "Tarjetas", hint: "Aparecen al pagar con débito o crédito." },
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
                <div key={s.id} className="flex items-center gap-2 py-3">
                  <div className="flex min-w-0 flex-1 items-baseline gap-2">
                    <span className="truncate font-medium">{s.name}</span>
                    <span className="text-sm text-muted-foreground">
                      {s.expenseCount} {s.expenseCount === 1 ? "gasto" : "gastos"}
                    </span>
                  </div>
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
