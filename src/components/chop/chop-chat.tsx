"use client";

import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import { MicIcon, RotateCcwIcon, SendHorizontalIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { resetChop, sendAudioToChop, talkToChop } from "@/lib/actions/chop";
import type { ChopMessage } from "@/lib/whatsapp/outbox";
import { cn } from "@/lib/utils";
import { ChopAvatar } from "./chop-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Chat con Chop (vive dentro de la ventana flotante, ver chop-widget.tsx). Cada mensaje va al
// servidor (talkToChop), que lo procesa con el mismo cerebro que WhatsApp y devuelve las
// respuestas: textos, botones o listas de opciones.
// El historial se guarda en este navegador (localStorage) para no perderlo al recargar.

type Entry =
  | { id: string; from: "me"; text: string }
  | { id: string; from: "chop"; message: ChopMessage };

const MAX_HISTORY = 60; // mensajes que recordamos
const MAX_RECORDING_S = 60; // un minuto de audio como máximo
const SUGGESTIONS = ["menu", "¿Cuánto gasté este mes?", "super 12500 débito"];

const storageKey = (userId: string) => `salt:chop:${userId}`;

function loadHistory(userId: string): Entry[] {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    return raw ? (JSON.parse(raw) as Entry[]) : [];
  } catch {
    return []; // navegador sin localStorage (modo privado, etc.): arrancamos vacío
  }
}

function saveHistory(userId: string, entries: Entry[]) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(entries.slice(-MAX_HISTORY)));
  } catch {
    // si no se puede guardar, el chat igual funciona (solo se pierde al recargar)
  }
}

export function ChopChat({
  userId,
  name,
  open,
  onClose,
}: {
  userId: string;
  name: string;
  open: boolean;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // El historial se lee recién en el navegador (en el servidor no existe localStorage)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- leer localStorage solo se puede después de montar
    setEntries(loadHistory(userId));
    setLoaded(true);
  }, [userId]);

  useEffect(() => {
    if (loaded) saveHistory(userId, entries);
  }, [entries, loaded, userId]);

  // Cada vez que llega algo (o se abre la ventana), bajamos hasta el último mensaje
  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [entries, pending, open]);

  // Al abrir, el cursor va directo al campo de texto (en la compu; en el celular abriría el teclado)
  useEffect(() => {
    if (open && window.matchMedia("(min-width: 640px)").matches) inputRef.current?.focus();
  }, [open]);

  const add = (...items: Entry[]) => setEntries((prev) => [...prev, ...items]);
  const fromChop = (messages: ChopMessage[]) =>
    messages.map((message): Entry => ({ id: crypto.randomUUID(), from: "chop", message }));

  function send(input: { text: string } | { replyId: string; title: string }) {
    add({ id: crypto.randomUUID(), from: "me", text: "text" in input ? input.text : input.title });
    startTransition(async () => {
      try {
        const replies = await talkToChop("text" in input ? { text: input.text } : { replyId: input.replyId });
        add(...fromChop(replies));
      } catch {
        toast.error("No pude hablar con Chop. Revisá tu conexión y probá de nuevo.");
      }
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value || pending) return;
    setText("");
    send({ text: value });
    inputRef.current?.focus();
  }

  function sendAudio(blob: Blob, seconds: number) {
    add({ id: crypto.randomUUID(), from: "me", text: `🎤 Audio (${formatSeconds(seconds)})` });
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append("audio", blob, "audio.webm");
        const { messages } = await sendAudioToChop(formData);
        add(...fromChop(messages));
      } catch {
        toast.error("No pude mandar el audio. Probá de nuevo.");
      }
    });
  }

  function restart() {
    setEntries([]);
    startTransition(() => resetChop());
  }

  // Los botones solo se pueden tocar en las respuestas a tu último mensaje:
  // los de más arriba ya quedaron viejos (Chop está en otro paso)
  const lastMine = entries.findLastIndex((e) => e.from === "me");

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <ChopAvatar size="sm" />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg leading-tight font-semibold">Chop</h2>
          <p className="truncate text-sm text-muted-foreground">
            {pending ? "escribiendo..." : "Tu beagle de los gastos"}
          </p>
        </div>
        {entries.length > 0 && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={restart}
            disabled={pending}
            aria-label="Nueva conversación"
            title="Nueva conversación"
          >
            <RotateCcwIcon />
          </Button>
        )}
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Cerrar chat">
          <XIcon />
        </Button>
      </div>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4" aria-live="polite">
        {loaded && entries.length === 0 && (
          <div className="flex flex-col gap-3">
            <Bubble from="chop">
              <FormattedText
                text={`¡Hola ${name}! 👋 Soy *Chop*. Contame un gasto (ej: _"nafta 15000"_), preguntame cuánto gastaste o escribí *menu* para ver las opciones.`}
              />
            </Bubble>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <Button key={s} variant="outline" size="sm" className="rounded-full" onClick={() => send({ text: s })}>
                  {s}
                </Button>
              ))}
            </div>
          </div>
        )}

        {entries.map((entry, i) =>
          entry.from === "me" ? (
            <Bubble key={entry.id} from="me">
              {entry.text}
            </Bubble>
          ) : (
            <ChopReply
              key={entry.id}
              message={entry.message}
              active={i > lastMine && !pending}
              onReply={(replyId, title) => send({ replyId, title })}
            />
          ),
        )}

        {pending && (
          <Bubble from="chop">
            <span className="flex gap-1 py-1" aria-label="Chop está escribiendo">
              {[0, 150, 300].map((delay) => (
                <span
                  key={delay}
                  className="size-1.5 animate-bounce rounded-full bg-muted-foreground"
                  style={{ animationDelay: `${delay}ms` }}
                />
              ))}
            </span>
          </Bubble>
        )}
        <div ref={bottomRef} />
      </div>

      <Composer
        text={text}
        setText={setText}
        inputRef={inputRef}
        pending={pending}
        onSubmit={submit}
        onAudio={sendAudio}
      />
    </div>
  );
}

function Bubble({ from, children }: { from: "me" | "chop"; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap sm:max-w-[70%]",
        from === "me"
          ? "self-end rounded-br-md bg-primary text-primary-foreground"
          : "self-start rounded-bl-md bg-muted text-foreground",
      )}
    >
      {children}
    </div>
  );
}

/** Una respuesta de Chop: texto solo, texto con botones, o texto con lista de opciones */
function ChopReply({
  message,
  active,
  onReply,
}: {
  message: ChopMessage;
  active: boolean;
  onReply: (replyId: string, title: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Bubble from="chop">
        <FormattedText text={message.body} />
      </Bubble>
      {message.type === "buttons" && (
        <div className="flex flex-wrap gap-2">
          {message.buttons.map((b) => (
            <Button
              key={b.id}
              variant="outline"
              size="sm"
              className="rounded-full"
              disabled={!active}
              onClick={() => onReply(b.id, b.title)}
            >
              {b.title}
            </Button>
          ))}
        </div>
      )}
      {message.type === "list" && (
        <div className="flex w-full max-w-sm flex-col divide-y overflow-hidden rounded-xl border">
          {message.rows.map((r) => (
            <button
              key={r.id}
              type="button"
              disabled={!active}
              onClick={() => onReply(r.id, r.title)}
              className="flex flex-col px-3.5 py-2 text-left text-sm hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
            >
              <span className="font-medium">{r.title}</span>
              {r.description && <span className="text-xs text-muted-foreground">{r.description}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** El formato de WhatsApp: *negrita* y _cursiva_ (el resto se muestra tal cual) */
function FormattedText({ text }: { text: string }) {
  const parts = text.split(/(\*[^*\n]+\*|_[^_\n]+_)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (/^\*[^*\n]+\*$/.test(part)) return <strong key={i}>{part.slice(1, -1)}</strong>;
        if (/^_[^_\n]+_$/.test(part)) return <em key={i}>{part.slice(1, -1)}</em>;
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}

const formatSeconds = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/**
 * Barra de abajo: campo de texto + botón. Sin texto, el botón es un micrófono (como en
 * WhatsApp); al grabar aparecen el tiempo, cancelar y enviar.
 */
function Composer({
  text,
  setText,
  inputRef,
  pending,
  onSubmit,
  onAudio,
}: {
  text: string;
  setText: (v: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  pending: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onAudio: (blob: Blob, seconds: number) => void;
}) {
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const cancelled = useRef(false);
  const startedAt = useRef(0);
  const [seconds, setSeconds] = useState<number | null>(null); // null = no está grabando

  // Reloj de la grabación; al llegar al máximo, se envía sola
  useEffect(() => {
    if (seconds === null) return;
    if (seconds >= MAX_RECORDING_S) {
      recorder.current?.stop();
      return;
    }
    const t = setTimeout(() => setSeconds((s) => (s === null ? null : s + 1)), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error("Este navegador no permite grabar audio.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunks.current = [];
      cancelled.current = false;
      rec.ondataavailable = (e) => chunks.current.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((track) => track.stop()); // apaga el micrófono
        const duration = Math.round((Date.now() - startedAt.current) / 1000);
        setSeconds(null);
        if (!cancelled.current && chunks.current.length > 0) {
          onAudio(new Blob(chunks.current, { type: rec.mimeType }), duration);
        }
      };
      recorder.current = rec;
      rec.start();
      startedAt.current = Date.now();
      setSeconds(0);
    } catch {
      toast.error("No tengo permiso para usar el micrófono. Habilitalo en el navegador.");
    }
  }

  function stop(cancel: boolean) {
    cancelled.current = cancel;
    recorder.current?.stop();
  }

  if (seconds !== null) {
    return (
      <div className="flex items-center gap-2 border-t px-4 py-3">
        <Button variant="ghost" size="icon" onClick={() => stop(true)} aria-label="Cancelar audio">
          <XIcon />
        </Button>
        <div className="flex flex-1 items-center gap-2 text-sm">
          <span className="size-2.5 animate-pulse rounded-full bg-red-600" aria-hidden />
          Grabando {formatSeconds(seconds)}
        </div>
        <Button size="icon" className="rounded-full" onClick={() => stop(false)} aria-label="Enviar audio">
          <SendHorizontalIcon />
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex items-center gap-2 border-t px-4 py-3">
      <Input
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Escribile a Chop..."
        maxLength={500}
        className="h-10 rounded-full px-4"
        aria-label="Mensaje para Chop"
        autoComplete="off"
      />
      {text.trim() ? (
        <Button type="submit" size="icon" className="size-10 rounded-full" disabled={pending} aria-label="Enviar">
          <SendHorizontalIcon />
        </Button>
      ) : (
        <Button
          type="button"
          size="icon"
          className="size-10 rounded-full"
          disabled={pending}
          onClick={startRecording}
          aria-label="Grabar audio"
        >
          <MicIcon />
        </Button>
      )}
    </form>
  );
}
