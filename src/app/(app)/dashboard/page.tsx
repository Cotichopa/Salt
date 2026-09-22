import type { Metadata } from "next";
import { requireUser } from "@/lib/dal";

export const metadata: Metadata = { title: "Inicio · Salt" };

export default async function DashboardPage() {
  const user = await requireUser();

  return (
    <div className="flex flex-col gap-2 py-6">
      <h1 className="text-2xl font-semibold">Hola, {user.name} 👋</h1>
      <p className="text-muted-foreground">
        Acá vas a ver el resumen de tus gastos y los gráficos (etapas 4 y 6).
      </p>
    </div>
  );
}
