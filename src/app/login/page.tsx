import type { Metadata } from "next";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Ingresar · Salt" };

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh flex-col lg:grid lg:grid-cols-[1.1fr_1fr]">
      {/* Panel de marca: la palabra hace de imagen. En celular queda como franja superior. */}
      <aside className="relative flex flex-col justify-center gap-8 lg:justify-between overflow-hidden bg-foreground px-6 py-10 text-background lg:px-14 lg:py-16">
        <div className="flex flex-col gap-6">
          <Logo className="size-10 lg:size-14" />
          <h1 className="font-display text-[clamp(4rem,18vw,11rem)] leading-[0.82] font-semibold tracking-[-0.04em]">
            Salt
          </h1>
        </div>

        <p className="max-w-[22ch] font-display text-xl leading-snug text-background/70 lg:text-3xl">
          Cada peso que sale de casa, anotado sin pensarlo.
        </p>

        <p className="hidden text-sm text-background/50 lg:block">
          Cargá tus gastos acá o escribiéndole a Chop por WhatsApp.
        </p>
      </aside>

      {/* Formulario */}
      <section className="flex flex-1 flex-col px-6 py-10 lg:px-14 lg:py-16">
        <div className="flex justify-end">
          <ThemeToggle />
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-8">
          <div className="flex flex-col gap-2">
            <h2 className="font-display text-3xl font-semibold tracking-tight">Entrá a tu cuenta</h2>
            <p className="text-sm text-muted-foreground">
              Si todavía no tenés una, pedísela a quien administra Salt en tu casa.
            </p>
          </div>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
