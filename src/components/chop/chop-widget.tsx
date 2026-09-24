"use client";

import { useEffect, useState } from "react";
import { XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChopAvatar } from "./chop-avatar";
import { ChopChat } from "./chop-chat";

// Botón flotante de Chop (abajo a la derecha, en todas las pantallas) y su ventana de chat.
// En la compu es una ventanita encima de la app; en el celular ocupa toda la pantalla.
// El chat queda siempre montado y solo se esconde: así, si cerrás mientras Chop está
// respondiendo, la respuesta no se pierde y la ves al volver a abrir.

export function ChopWidget({ userId, name }: { userId: string; name: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Escape cierra la ventana
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    // En el celular el chat tapa todo: frenamos el scroll de la página de atrás
    const fullScreen = !window.matchMedia("(min-width: 640px)").matches;
    if (fullScreen) document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <div
        role="dialog"
        aria-label="Chat con Chop"
        className={cn(
          "fixed inset-0 z-50 flex-col bg-background",
          "sm:inset-auto sm:right-5 sm:bottom-24 sm:h-[min(640px,calc(100dvh-8rem))] sm:w-96 sm:overflow-hidden sm:rounded-2xl sm:border sm:shadow-2xl",
          open ? "flex" : "hidden",
        )}
      >
        <ChopChat userId={userId} name={name} open={open} onClose={() => setOpen(false)} />
      </div>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Cerrar Chop" : "Hablar con Chop"}
        aria-expanded={open}
        title={open ? undefined : "Hablar con Chop"}
        className={cn(
          "fixed right-5 bottom-5 z-40 rounded-full shadow-lg transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
          open && "max-sm:hidden", // en el celular se cierra con la X del chat
        )}
      >
        {open ? (
          <span className="flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <XIcon className="size-6" />
          </span>
        ) : (
          <ChopAvatar size="lg" />
        )}
      </button>
    </>
  );
}
