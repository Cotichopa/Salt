"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { CheckIcon, UndoIcon } from "lucide-react";
import { toast } from "sonner";
import { markPaid, unmarkPaid } from "@/lib/actions/card-statements";
import { getRateAction } from "@/lib/actions/expenses";
import { formatMoney, parseAmount } from "@/lib/format";
import type { FormState } from "@/lib/validators";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FieldError } from "@/components/field-error";

// Ventana para marcar un resumen como pagado (pago completo). Los dólares se pagan en pesos
// (al dólar oficial del día del pago, que se busca solo) o en dólares. El total en pesos se calcula
// solo, pero se puede corregir con lo que realmente cobró el banco.

type Props = { cardId: string; month: string; closing: string; ars: number; usd: number; rate: number | null; today: string };

const usdOptions = [
  { value: "ARS", label: "En pesos" },
  { value: "USD", label: "En dólares" },
];
const toInput = (n: number) => String(n).replace(".", ",");

export function MarkPaidDialog({ cardId, month, closing, ars, usd, rate: initialRate, today }: Props) {
  const [open, setOpen] = useState(false);
  const [paidOn, setPaidOn] = useState(today);
  const [usdPaidIn, setUsdPaidIn] = useState<"ARS" | "USD">("ARS");
  const [rate, setRate] = useState(initialRate ? toInput(initialRate) : "");
  const [rateTouched, setRateTouched] = useState(false);
  const [total, setTotal] = useState("");
  const [totalTouched, setTotalTouched] = useState(false);
  const rateRequest = useRef(0); // si se piden dos seguidas, gana la última

  const [state, action, pending] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await markPaid(prev, formData);
    if (result?.ok) {
      toast.success(result.message);
      setOpen(false);
    }
    return result;
  }, undefined);

  // Total que se propone: los pesos + los dólares pasados a pesos (si se pagaron en pesos)
  const parsedRate = parseAmount(rate);
  const suggested = Math.round((ars + (usd > 0 && usdPaidIn === "ARS" ? usd * (parsedRate ?? 0) : 0)) * 100) / 100;
  const shownTotal = totalTouched ? total : toInput(suggested);

  async function changePaidOn(value: string) {
    setPaidOn(value);
    if (usd === 0 || rateTouched || !value) return;
    const request = ++rateRequest.current;
    const found = await getRateAction("OFICIAL", value);
    if (request === rateRequest.current && found) setRate(toInput(found.sell));
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <CheckIcon />
        Marcar como pagado
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Pagaste este resumen?</DialogTitle>
          <DialogDescription>
            Guardá cuánto pagaste realmente. No se carga como gasto: los gastos de la tarjeta ya están cargados uno por uno.
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="cardId" value={cardId} />
          <input type="hidden" name="month" value={month} />
          <input type="hidden" name="usdPaidIn" value={usdPaidIn} />

          <div className="flex flex-col gap-2">
            <Label htmlFor="paidOn">Fecha de pago</Label>
            <Input id="paidOn" name="paidOn" type="date" min={closing} max={today} value={paidOn} onChange={(e) => changePaidOn(e.target.value)} required />
            <FieldError errors={state?.errors?.paidOn} />
            {state?.message && !state.ok && <p className="text-sm text-destructive">{state.message}</p>}
          </div>

          {/* Los dólares del resumen: en pesos (a qué dólar) o en dólares */}
          {usd > 0 && (
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <Label>Los {formatMoney(usd, "USD")}</Label>
                <Select items={usdOptions} value={usdPaidIn} onValueChange={(v) => setUsdPaidIn(v as "ARS" | "USD")}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {usdOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {usdPaidIn === "ARS" && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="rate">Dólar oficial del pago</Label>
                  <Input
                    id="rate"
                    name="rate"
                    inputMode="decimal"
                    value={rate}
                    onChange={(e) => {
                      setRate(e.target.value);
                      setRateTouched(true);
                    }}
                  />
                  <FieldError errors={state?.errors?.rate} />
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="totalArs">Total pagado en pesos</Label>
            <Input
              id="totalArs"
              name="totalArs"
              inputMode="decimal"
              value={shownTotal}
              onChange={(e) => {
                setTotal(e.target.value);
                setTotalTouched(true);
              }}
            />
            <p className="text-sm text-muted-foreground">
              {usd > 0 && usdPaidIn === "USD"
                ? `Más ${formatMoney(usd, "USD")} pagados en dólares. `
                : ""}
              Si el banco te cobró otro número (intereses, ajustes), poné ese.
            </p>
            <FieldError errors={state?.errors?.totalArs} />
          </div>

          <Button type="submit" disabled={pending}>
            {pending ? "Guardando..." : "Marcar como pagado"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Deshacer el "pagado", por si se marcó por error */
export function UnmarkPaidButton({ cardId, month }: { cardId: string; month: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const result = await unmarkPaid(cardId, month);
          if (result?.ok) toast.success(result.message);
        })
      }
    >
      <UndoIcon />
      {pending ? "Deshaciendo..." : "Desmarcar"}
    </Button>
  );
}
