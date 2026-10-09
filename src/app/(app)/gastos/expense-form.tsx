"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { LoaderCircleIcon, ReceiptTextIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { getRateAction, readReceiptForForm, saveExpense, type ReceiptFill } from "@/lib/actions/expenses";
import { shrinkPhoto } from "@/lib/shrink-photo";
import {
  currencyLabels,
  dollarTypeFor,
  dollarTypeLabels,
  formatMoney,
  parseAmount,
  paymentMethodLabels,
  type CurrencyCode,
  type DollarTypeCode,
  type PaymentMethodCode,
} from "@/lib/format";
import type { ExpenseDTO } from "@/lib/services/expenses";
import type { FormState } from "@/lib/validators";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FieldError } from "@/components/field-error";
import { CategoryIcon } from "@/components/category-icon";
import { useFormDefaults } from "@/components/form-defaults";
import { ReceiptViewer } from "@/components/receipt-viewer";
import { useReadOnly } from "@/components/read-only";
import { TagInput } from "@/components/tag-input";

export type CategoryOption = { id: string; name: string; emoji: string | null; icon: string | null };
export type SourceOption = { id: string; name: string; kind: "CARD" | "WALLET" };

const currencies = Object.entries(currencyLabels).map(([value, label]) => ({ value, label }));
const paymentMethods = Object.entries(paymentMethodLabels).map(([value, label]) => ({ value, label }));
const dollarTypes = Object.entries(dollarTypeLabels).map(([value, label]) => ({ value, label }));

type Props = {
  categories: CategoryOption[];
  sources: SourceOption[];
  expense?: ExpenseDTO; // si viene, es edición
  today: string;
  onDone: () => void;
};

export function ExpenseForm({ categories, sources, expense, today, onDone }: Props) {
  // Lo que se propone al cargar uno nuevo (preferencias de "Cuenta")
  const defaults = useFormDefaults();
  const readOnly = useReadOnly();
  const [state, action, pending] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await saveExpense(prev, formData);
    if (result?.ok) {
      toast.success(result.message);
      // Aviso de presupuesto: se queda más tiempo en pantalla para que se llegue a leer
      if (result.warning) toast.warning(result.warning, { duration: 8000 });
      onDone();
    }
    return result;
  }, undefined);

  // El medio de pago define si se pide tarjeta, billetera o nada, y si hay cuotas
  const [method, setMethod] = useState<PaymentMethodCode>(expense?.paymentMethod ?? defaults.paymentMethod);
  const [amount, setAmount] = useState(expense ? String(expense.amount).replace(".", ",") : "");
  const [installments, setInstallments] = useState("1");
  const [date, setDate] = useState(expense?.date ?? today);
  // Controlados (con value y no defaultValue) para poder completarlos con lo que se lee del ticket
  const [categoryId, setCategoryId] = useState<string | null>(expense?.category.id ?? null);
  const [sourceId, setSourceId] = useState<string | null>(expense?.paymentSource?.id ?? null);
  const [description, setDescription] = useState(expense?.description ?? "");

  // Dólares: a qué dólar y a qué cotización. Con crédito siempre es el oficial (no se elige);
  // con los demás medios, el que elijas (chosenDollar). La cotización se busca sola al cambiar
  // el dólar o la fecha, salvo que la hayas escrito a mano (rateTouched).
  const [currency, setCurrency] = useState<CurrencyCode>(expense?.currency ?? "ARS");
  const [chosenDollar, setChosenDollar] = useState<DollarTypeCode>(
    expense?.dollarType && expense.paymentMethod !== "CREDIT" ? expense.dollarType : defaults.dollarType,
  );
  const dollarType = dollarTypeFor(method, chosenDollar);
  // La cotización guardada solo sirve si es del mismo dólar (un gasto viejo con crédito puede
  // estar al dólar tarjeta: al editarlo pasa al oficial y la cotización se busca de nuevo)
  const [rate, setRate] = useState(
    expense?.rate && expense.dollarType === dollarTypeFor(expense.paymentMethod, expense.dollarType)
      ? String(expense.rate).replace(".", ",")
      : "",
  );
  const [rateTouched, setRateTouched] = useState(false);
  const [rateLoading, setRateLoading] = useState(false);
  const rateRequest = useRef(0); // si se piden dos seguidas, gana la última

  async function loadRate(type: DollarTypeCode, day: string) {
    if (rateTouched) return;
    const request = ++rateRequest.current;
    setRateLoading(true);
    const found = await getRateAction(type, day);
    if (request !== rateRequest.current) return;
    setRateLoading(false);
    setRate(found ? String(found.sell).replace(".", ",") : "");
  }

  function changeCurrency(value: CurrencyCode) {
    setCurrency(value);
    if (value === "USD" && !rate) loadRate(dollarType, date);
  }
  function changeDollarType(value: DollarTypeCode) {
    setChosenDollar(value);
    if (currency === "USD") loadRate(value, date);
  }
  function changeMethod(value: PaymentMethodCode) {
    setMethod(value);
    // Al pasar de tarjeta a billetera (o a efectivo) se limpia la elección anterior
    if (sourceKind(value) !== sourceKind(method)) setSourceId(null);
    // Pasar a crédito (o salir de crédito) cambia el dólar: se busca su cotización
    const next = dollarTypeFor(value, chosenDollar);
    if (next !== dollarType && currency === "USD") loadRate(next, date);
  }
  function changeDate(value: string) {
    setDate(value);
    if (currency === "USD" && value) loadRate(dollarType, value);
  }

  /** Completa el formulario con lo que se leyó del ticket (se puede revisar y corregir antes de guardar) */
  function applyFill(fill: ReceiptFill) {
    const nextMethod = fill.paymentMethod ?? method;
    setAmount(String(fill.amount).replace(".", ","));
    setCurrency(fill.currency);
    setDate(fill.date);
    if (fill.categoryId) setCategoryId(fill.categoryId);
    setMethod(nextMethod);
    setSourceId(fill.sourceId);
    setInstallments(String(fill.installments));
    if (fill.description) setDescription(fill.description);
    if (fill.currency === "USD") loadRate(dollarTypeFor(nextMethod, chosenDollar), fill.date);
  }

  const kind = sourceKind(method);
  const sourceOptions = sources.filter((s) => s.kind === kind).map((s) => ({ value: s.id, label: s.name }));
  const categoryItems = categories.map((c) => ({ value: c.id, label: c.name }));
  const errors = state?.errors;

  // Cuotas: mostramos cuánto queda cada una para que no haya sorpresas
  const installmentCount = Number(installments) || 1;
  const parsedAmount = parseAmount(amount);
  const perInstallment = parsedAmount && installmentCount > 1 ? parsedAmount / installmentCount : null;
  const parsedRate = parseAmount(rate);

  return (
    <form action={action}>
      {/* En "ver como" se ve el gasto con todos sus datos, pero los campos no se pueden tocar */}
      <fieldset disabled={readOnly} className="grid min-w-0 gap-4 sm:grid-cols-2">
        {expense && <input type="hidden" name="id" value={expense.id} />}

        {/* Si el gasto ya tiene ticket, se ve arriba del formulario (expense-list.tsx) */}
        {!expense?.receiptId && !readOnly && <AttachReceipt fill={!expense} onFill={applyFill} />}

        <div className="flex flex-col gap-2">
          <Label htmlFor="amount">Monto {installmentCount > 1 && "total de la compra"}</Label>
          <Input
            id="amount"
            name="amount"
            inputMode="decimal"
            placeholder="15.000"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            autoFocus
            required
          />
          <FieldError errors={errors?.amount} />
        </div>

        <div className="flex flex-col gap-2">
          <Label>Moneda</Label>
          <Select name="currency" items={currencies} value={currency} onValueChange={(v) => changeCurrency(v as CurrencyCode)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {currencies.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Dólares: a qué dólar y a cuánto (así el gasto también se guarda en pesos).
            Con crédito no se elige: el banco cobra al oficial. */}
        {currency === "USD" && (
          <>
            {method === "CREDIT" ? (
              <div className="flex flex-col gap-2">
                <Label>Dólar</Label>
                <input type="hidden" name="dollarType" value="OFICIAL" />
                <p className="rounded-lg border px-3 py-2 text-sm text-muted-foreground">
                  Con crédito es el <span className="font-medium text-foreground">dólar oficial</span>: el banco
                  te lo cobra al oficial del día en que pagás el resumen.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Label>¿A qué dólar lo pagaste?</Label>
                <Select
                  name="dollarType"
                  items={dollarTypes}
                  value={dollarType}
                  onValueChange={(v) => changeDollarType(v as DollarTypeCode)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {dollarTypes.map((d) => (
                      <SelectItem key={d.value} value={d.value}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError errors={errors?.dollarType} />
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="rate">Cotización</Label>
              <Input
                id="rate"
                name="rate"
                inputMode="decimal"
                placeholder={rateLoading ? "Buscando..." : "1.557"}
                value={rate}
                onChange={(e) => {
                  setRate(e.target.value);
                  setRateTouched(true);
                }}
              />
              {parsedAmount && parsedRate ? (
                <p className="text-sm text-muted-foreground">
                  {formatMoney(parsedAmount, "USD")} × {formatMoney(parsedRate, "ARS")} ={" "}
                  <span className="font-medium text-foreground">{formatMoney(Math.round(parsedAmount * parsedRate * 100) / 100, "ARS")}</span>
                </p>
              ) : (
                !rateLoading && <p className="text-sm text-muted-foreground">Vacía = la del día, si se consigue.</p>
              )}
              <FieldError errors={errors?.rate} />
            </div>
          </>
        )}

        <div className="flex flex-col gap-2">
          <Label>Categoría</Label>
          <Select name="categoryId" items={categoryItems} value={categoryId} onValueChange={(v) => setCategoryId(v as string)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Elegí una categoría" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  <span className="flex items-center gap-2">
                    <CategoryIcon icon={c.icon} emoji={c.emoji} size="sm" />
                    {c.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError errors={errors?.categoryId} />
        </div>

        <div className="flex flex-col gap-2">
          <Label>Medio de pago</Label>
          <Select
            name="paymentMethod"
            items={paymentMethods}
            value={method}
            onValueChange={(v) => changeMethod(v as PaymentMethodCode)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {paymentMethods.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Tarjeta o billetera, según el medio de pago. El efectivo no lleva. */}
        {kind && (
          <div className="flex flex-col gap-2">
            <Label>{kind === "CARD" ? "Tarjeta" : "Billetera"} (opcional)</Label>
            <Select name="paymentSourceId" items={sourceOptions} value={sourceId} onValueChange={(v) => setSourceId(v as string)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={kind === "CARD" ? "¿Con cuál?" : "¿Con cuál?"} />
              </SelectTrigger>
              <SelectContent>
                {sourceOptions.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError errors={errors?.paymentSourceId} />
          </div>
        )}

        {/* Cuotas: solo para crédito y solo al cargar (al editar se cambia el movimiento suelto) */}
        {method === "CREDIT" && !expense && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="installments">Cuotas</Label>
            <Input
              id="installments"
              name="installments"
              type="number"
              min={1}
              max={36}
              value={installments}
              onChange={(e) => setInstallments(e.target.value)}
            />
            {perInstallment && (
              <p className="text-sm text-muted-foreground">
                {installmentCount} cuotas de {formatMoney(Math.round(perInstallment * 100) / 100, currency)}, una por mes
              </p>
            )}
            <FieldError errors={errors?.installments} />
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Label htmlFor="date">Fecha {installmentCount > 1 && "de la compra"}</Label>
          <Input
            id="date"
            name="date"
            type="date"
            max={today}
            value={date}
            onChange={(e) => changeDate(e.target.value)}
            required
          />
          <FieldError errors={errors?.date} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="description">Descripción (opcional)</Label>
          <Input
            id="description"
            name="description"
            placeholder="Pizza con amigos"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <FieldError errors={errors?.description} />
        </div>

        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="tags">Etiquetas (opcional)</Label>
          <TagInput
            id="tags"
            name="tags"
            initial={expense?.tags.map((t) => t.name) ?? []}
            suggestions={defaults.tags}
            disabled={readOnly}
          />
          <p className="text-xs text-muted-foreground">
            Para juntar gastos de varias categorías: un viaje, un cumpleaños, una obra.
            {(expense?.installments ?? 1) > 1 && " Van a todas las cuotas de la compra."}
          </p>
          <FieldError errors={errors?.tags} />
        </div>

        {state?.message && !state.ok && <p className="text-sm text-destructive sm:col-span-2">{state.message}</p>}

        {!readOnly && (
          <Button type="submit" disabled={pending} className="sm:col-span-2" size="lg">
            {pending ? "Guardando..." : expense ? "Guardar cambios" : "Cargar gasto"}
          </Button>
        )}
      </fieldset>
    </form>
  );
}

const sourceKind = (method: PaymentMethodCode) => (method === "TRANSFER" ? "WALLET" : method === "CASH" ? null : "CARD");

/**
 * "Adjuntar ticket": foto o PDF. Al cargar un gasto nuevo (`fill`), la IA lo lee y completa el
 * formulario; al editar, solo se adjunta (para no pisar lo que ya está cargado). El ticket ya queda
 * guardado; se asocia al gasto con el campo oculto receiptId al guardar.
 */
function AttachReceipt({ fill, onFill }: { fill: boolean; onFill: (fill: ReceiptFill) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [receipt, setReceipt] = useState<{ id: string; kind: "image" | "pdf" } | null>(null);
  const [reading, startReading] = useTransition();

  function picked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // para poder elegir el mismo archivo otra vez
    if (!file) return;
    const pdf = file.type === "application/pdf";
    if (!pdf && !file.type.startsWith("image/")) {
      toast.error("Ese archivo no lo puedo leer: adjuntá el ticket como foto o como PDF.");
      return;
    }
    startReading(async () => {
      try {
        const formData = new FormData();
        formData.append("file", pdf ? file : await shrinkPhoto(file), pdf ? file.name : "ticket.jpg");
        if (fill) formData.append("fill", "1");
        const result = await readReceiptForForm(formData);
        if (!result.ok) {
          toast.error(result.message);
          return;
        }
        setReceipt({ id: result.receiptId, kind: result.kind });
        if (result.fill) {
          onFill(result.fill);
          toast.success(result.message);
        } else if (fill) toast.warning(result.message, { duration: 8000 });
        else toast.success(result.message);
      } catch {
        toast.error("No pude subir el ticket. Probá de nuevo.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 sm:col-span-2">
      <input ref={input} type="file" accept="image/*,application/pdf" className="hidden" onChange={picked} />
      {receipt ? (
        <div className="flex items-center gap-2">
          <input type="hidden" name="receiptId" value={receipt.id} />
          <div className="min-w-0 flex-1">
            <ReceiptViewer id={receipt.id} kind={receipt.kind} />
          </div>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Quitar ticket" onClick={() => setReceipt(null)}>
            <XIcon />
          </Button>
        </div>
      ) : (
        <button
          type="button"
          disabled={reading}
          onClick={() => input.current?.click()}
          className="flex items-center gap-3 rounded-lg border border-dashed p-3 text-left text-sm hover:bg-muted/50 disabled:opacity-70"
        >
          {reading ? (
            <LoaderCircleIcon className="size-5 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <ReceiptTextIcon className="size-5 shrink-0 text-muted-foreground" />
          )}
          <span className="flex flex-col">
            <span className="font-medium">{reading ? "Leyendo el ticket..." : "Adjuntar ticket"}</span>
            <span className="text-xs text-muted-foreground">
              {fill ? "Foto o PDF: lo leo y completo el formulario" : "Foto o PDF"}
            </span>
          </span>
        </button>
      )}
    </div>
  );
}
