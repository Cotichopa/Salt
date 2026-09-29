"use client";

import { useEffect, useRef, useState } from "react";
import { DownloadIcon, FileTextIcon, MinusIcon, PlusIcon, ReceiptTextIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

// El ticket de un gasto (la foto o la factura en PDF que se mandó a Chop): una miniatura que, al
// tocarla, lo abre en grande dentro de la app, con zoom y para descargarlo.
// Los PDF se dibujan con pdf.js: Chrome en Android no muestra un PDF dentro de una página.

const ZOOMS = [1, 1.5, 2, 3];

export function ReceiptViewer({ id, kind }: { id: string; kind: "image" | "pdf" | null }) {
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState(0); // posición en ZOOMS
  const src = `/api/tickets/${id}`;
  const pdf = kind === "pdf";

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        setZoom(0);
      }}
    >
      <DialogTrigger
        render={
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-lg border p-2 text-left text-sm hover:bg-muted/50"
          />
        }
      >
        {pdf ? (
          <span className="flex size-16 items-center justify-center rounded-md bg-muted">
            <FileTextIcon className="size-7 text-muted-foreground" />
          </span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- foto privada servida por nuestra API, sin optimizar
          <img src={src} alt="" className="size-16 rounded-md object-cover" />
        )}
        <span className="flex items-center gap-1.5">
          <ReceiptTextIcon className="size-4" />
          {pdf ? "Ver factura (PDF)" : "Ver foto del ticket"}
        </span>
      </DialogTrigger>

      <DialogContent className="flex h-[calc(100dvh-2rem)] flex-col gap-0 p-0 sm:max-w-3xl">
        <DialogHeader className="border-b p-4 pr-12">
          <DialogTitle>{pdf ? "Factura" : "Foto del ticket"}</DialogTitle>
        </DialogHeader>

        {/* El zoom agranda el ancho: con más de 1 se recorre moviéndose para los costados.
            overflow-anchor: none, para que el navegador no corra el scroll cuando aparecen las páginas */}
        <div className="min-h-0 flex-1 overflow-auto bg-muted/50 p-2 [overflow-anchor:none]">
          <div className="mx-auto" style={{ width: `${ZOOMS[zoom] * 100}%`, maxWidth: ZOOMS[zoom] === 1 ? "48rem" : undefined }}>
            {pdf ? (
              <PdfPages src={src} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- foto privada servida por nuestra API, sin optimizar
              <img src={src} alt="Foto del ticket" className="w-full rounded-sm" />
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 border-t p-3">
          <Button variant="outline" size="icon-sm" aria-label="Achicar" disabled={zoom === 0} onClick={() => setZoom((z) => z - 1)}>
            <MinusIcon />
          </Button>
          <span className="w-12 text-center text-sm tabular-nums">{ZOOMS[zoom] * 100} %</span>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Agrandar"
            disabled={zoom === ZOOMS.length - 1}
            onClick={() => setZoom((z) => z + 1)}
          >
            <PlusIcon />
          </Button>
          <a href={src} download={pdf ? "factura.pdf" : "ticket.jpg"} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "ml-auto")}>
            <DownloadIcon />
            Descargar
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Las páginas del PDF, una debajo de la otra. pdf.js se carga recién acá (pesa bastante) y dibuja
 * cada página en un <canvas> con el doble de resolución del ancho que tiene: así el zoom se ve nítido.
 */
function PdfPages({ src }: { src: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const container = box.current;
    if (!container) return;
    let cancelled = false;
    let destroy: (() => Promise<void>) | undefined;

    (async () => {
      try {
        // El "worker" de pdf.js cargado como módulo: pdf.js lo usa en esta misma página y no hace
        // falta servirle un archivo aparte (para facturas de pocas páginas alcanza)
        await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        const data = await (await fetch(src)).arrayBuffer();
        const doc = await pdfjs.getDocument({ data, verbosity: pdfjs.VerbosityLevel.ERRORS }).promise;
        destroy = () => doc.destroy();
        const width = Math.min(container.clientWidth * window.devicePixelRatio * 2, 2400);
        for (let n = 1; n <= doc.numPages; n++) {
          const page = await doc.getPage(n);
          const viewport = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.className = "w-full rounded-sm bg-white shadow-sm";
          canvas.setAttribute("aria-label", `Página ${n} de ${doc.numPages}`);
          await page.render({ canvas, viewport }).promise;
          if (cancelled) return;
          container.appendChild(canvas);
        }
        setState("ready");
      } catch {
        if (!cancelled) setState("error");
      }
    })();

    return () => {
      cancelled = true;
      destroy?.();
      container.replaceChildren();
    };
  }, [src]);

  return (
    <>
      {state === "loading" && <p className="py-8 text-center text-sm text-muted-foreground">Cargando la factura...</p>}
      {state === "error" && (
        <p className="py-8 text-center text-sm text-muted-foreground">No pude mostrar la factura. Probá descargarla.</p>
      )}
      <div ref={box} className="flex flex-col gap-2" />
    </>
  );
}
