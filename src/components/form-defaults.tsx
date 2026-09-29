"use client";

import { createContext, useContext } from "react";
import type { DollarTypeCode, PaymentMethodCode } from "@/lib/format";

// Medio de pago y dólar que se proponen primero al cargar un gasto o un fijo (preferencias de
// "Cuenta"). El layout de la app los pone acá y los formularios los leen con useFormDefaults(),
// sin tener que pasarlos de componente en componente.

export type FormDefaults = { paymentMethod: PaymentMethodCode; dollarType: DollarTypeCode };

const FormDefaultsContext = createContext<FormDefaults>({ paymentMethod: "DEBIT", dollarType: "MEP" });

export function FormDefaultsProvider({ value, children }: { value: FormDefaults; children: React.ReactNode }) {
  return <FormDefaultsContext value={value}>{children}</FormDefaultsContext>;
}

export const useFormDefaults = () => useContext(FormDefaultsContext);
