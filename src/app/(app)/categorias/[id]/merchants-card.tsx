import { StoreIcon } from "lucide-react";
import { formatCuit } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MerchantDialog } from "./merchant-dialog";

// Tarjeta "Comercios" de la pantalla de una categoría: los comercios (por el CUIT de sus tickets)
// cuyos tickets Chop pone en esta categoría. Solo aparece si hay alguno.

type Option = { id: string; name: string; emoji: string | null; icon: string | null };

export function MerchantsCard({
  merchants,
  categoryId,
  categories,
}: {
  merchants: { id: string; cuit: string; name: string | null }[];
  categoryId: string;
  categories: Option[];
}) {
  if (merchants.length === 0) return null;
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Comercios</CardTitle>
        <CardDescription>Cuando le mandes a Chop un ticket de uno de estos comercios, va a esta categoría.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y">
          {merchants.map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
              <StoreIcon className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{m.name ?? "Sin nombre"}</p>
                <p className="text-xs text-muted-foreground tabular-nums">CUIT {formatCuit(m.cuit)}</p>
              </div>
              <MerchantDialog merchant={m} categoryId={categoryId} categories={categories} />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
