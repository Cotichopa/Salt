"use client";

import { createContext, useContext } from "react";
import type { DollarTypeCode, PaymentMethodCode } from "@/lib/format";

// Medio de pago y dólar que se proponen primero al cargar un gasto o un fijo (preferencias de
// "Cuenta"). El layout de la app los pone acá y los formularios los leen con useFormDefaults(),
// sin tener que pasarlos de componente en componente. También van las etiquetas de la cuenta, que el
// formulario de gasto sugiere al escribir.

export type FormDefaults = { paymentMethod: PaymentMethodCode; dollarType: DollarTypeCode; tags: string[] };

const FormDefaultsContext = createContext<FormDefaults>({ paymentMethod: "DEBIT", dollarType: "MEP", tags: [] });

export function FormDefaultsProvider({ value, children }: { value: FormDefaults; children: React.ReactNode }) {
  return <FormDefaultsContext value={value}>{children}</FormDefaultsContext>;
}

export const useFormDefaults = () => useContext(FormDefaultsContext);
