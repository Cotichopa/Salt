"use client";

import { useState } from "react";
import { XIcon } from "lucide-react";
import { parseTag, tagKey } from "@/lib/tags";
import { cn } from "@/lib/utils";

// Campo de etiquetas del formulario de gasto: las elegidas se ven como "chips" (#bariloche ×) y se
// agregan escribiendo y apretando espacio, Enter o coma, o tocando una sugerencia (las que ya tiene
// la cuenta). Al formulario le llega todo junto en el campo oculto `name` ("#bariloche #viaje"),
// también lo que quedó escrito sin confirmar.

const MAX_SUGGESTIONS = 8;

export function TagInput({
  name,
  id,
  initial,
  suggestions,
  disabled,
}: {
  name: string;
  id?: string;
  initial: string[];
  suggestions: string[];
  disabled?: boolean;
}) {
  const [tags, setTags] = useState(initial);
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);

  const has = (tag: string) => tags.some((t) => tagKey(t) === tagKey(tag));
  function add(raw: string) {
    const tag = parseTag(raw);
    if (tag && !has(tag.name)) setTags((prev) => [...prev, tag.name]);
    setText("");
  }
  const remove = (tag: string) => setTags((prev) => prev.filter((t) => t !== tag));

  const typed = tagKey(text);
  const options = suggestions.filter((s) => !has(s) && (!typed || tagKey(s).includes(typed))).slice(0, MAX_SUGGESTIONS);

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name={name} value={[...tags, text].map((t) => t.trim()).filter(Boolean).map((t) => `#${t.replace(/^#+/, "")}`).join(" ")} />
      <div
        className={cn(
          // Mismo aspecto que los otros campos (components/ui/input.tsx)
          "flex min-h-8 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-transparent px-2 py-1 text-base transition-colors md:text-sm dark:bg-input/30",
          focused && "border-ring ring-3 ring-ring/50",
          disabled && "bg-input/50 opacity-50",
        )}
      >
        {tags.map((t) => (
          <span key={t} className="flex items-center gap-1 rounded-md bg-muted px-2 py-0.5">
            #{t}
            {!disabled && (
              <button type="button" onClick={() => remove(t)} aria-label={`Sacar la etiqueta ${t}`} className="text-muted-foreground hover:text-foreground">
                <XIcon className="size-3" />
              </button>
            )}
          </span>
        ))}
        <input
          id={id}
          value={text}
          disabled={disabled}
          placeholder={tags.length === 0 ? "#vacaciones" : ""}
          className="min-w-24 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => {
            const value = e.target.value;
            // Espacio o coma al final: confirma la etiqueta que se venía escribiendo
            if (/[\s,]$/.test(value)) add(value.slice(0, -1));
            else setText(value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              // Enter agrega la etiqueta en vez de mandar el formulario (si no hay nada escrito, lo manda)
              if (text.trim()) {
                e.preventDefault();
                add(text);
              }
            } else if (e.key === "Backspace" && !text && tags.length > 0) {
              setTags((prev) => prev.slice(0, -1));
            }
          }}
        />
      </div>
      {!disabled && options.length > 0 && (focused || text) && (
        <div className="flex flex-wrap gap-1.5" aria-label="Etiquetas que ya usaste">
          {options.map((s) => (
            <button
              key={s}
              type="button"
              // onMouseDown: antes de que el campo pierda el foco (si no, la lista desaparece antes del clic)
              onMouseDown={(e) => {
                e.preventDefault();
                add(s);
              }}
              className="rounded-md border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              #{s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
