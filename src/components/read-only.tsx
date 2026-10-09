"use client";

import { createContext, useContext } from "react";

// "Ver como" (el superadmin mirando otra cuenta): las pantallas se ven igual pero sin los botones
// para cambiar cosas. Esto es solo para que la pantalla quede prolija: la traba de verdad está en
// el servidor (requireEditor en src/lib/dal.ts), que rechaza cualquier cambio.

const ReadOnlyContext = createContext(false);

export function ReadOnlyProvider({ value, children }: { value: boolean; children: React.ReactNode }) {
  return <ReadOnlyContext value={value}>{children}</ReadOnlyContext>;
}

export const useReadOnly = () => useContext(ReadOnlyContext);

/** Lo de adentro (botones de agregar, editar, borrar...) no se muestra en "ver como" */
export function Editable({ children }: { children: React.ReactNode }) {
  return useReadOnly() ? null : children;
}
