import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">🧂 Salt</h1>
      <p className="max-w-sm text-muted-foreground">
        Tus gastos del día a día, desde la web o por WhatsApp.
      </p>
      <Button>Próximamente: iniciar sesión</Button>
    </main>
  );
}
