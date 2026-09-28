import "server-only";
import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";

// Pasa un audio a texto con Whisper corriendo en esta misma compu (whisper.cpp), sin servicios
// externos. Lo usan el chat de la web y Chop por WhatsApp. Pasos:
// 1. ffmpeg (paquete ffmpeg-static) pasa el audio (OGG de WhatsApp, WebM del navegador) al formato
//    que lee Whisper: WAV, 16 kHz, mono.
// 2. whisper-cli lo transcribe en español.
// Se configura en el .env (ver .env.example): WHISPER_CLI (el programa) y WHISPER_MODEL (el modelo).
// Sin eso, Chop sigue contestando que todavía no escucha audios.

const run = promisify(execFile);

/** Largo máximo de un audio (decisión de Felipe): alcanza de sobra para cargar gastos */
export const MAX_AUDIO_SECONDS = 60;

export type Transcription =
  | { ok: true; text: string }
  | { ok: false; reason: "off" | "long" | "empty" | "error" };

export function isTranscriptionEnabled() {
  return !!process.env.WHISPER_CLI && !!process.env.WHISPER_MODEL && !!ffmpegPath;
}

/**
 * Audio (en cualquier formato) → texto. `hints`: palabras que probablemente diga (sus categorías y
 * tarjetas), para que Whisper las reconozca mejor.
 */
export async function transcribeAudio(audio: Blob | Buffer, hints: string[] = []): Promise<Transcription> {
  if (!isTranscriptionEnabled()) return { ok: false, reason: "off" };

  const dir = await mkdtemp(path.join(tmpdir(), "salt-audio-"));
  try {
    const input = path.join(dir, "audio.in");
    const wav = path.join(dir, "audio.wav");
    await writeFile(input, Buffer.isBuffer(audio) ? audio : Buffer.from(await audio.arrayBuffer()));

    // ffmpeg cuenta la duración en lo que escribe al convertir ("Duration: 00:00:12.34")
    const { stderr } = await run(ffmpegPath!, ["-hide_banner", "-y", "-i", input, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wav], {
      timeout: 30_000,
    });
    const d = /Duration: (\d+):(\d+):([\d.]+)/.exec(stderr);
    const seconds = d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : 0;
    if (seconds > MAX_AUDIO_SECONDS + 1) return { ok: false, reason: "long" };

    // Para comparar modelos con audios reales: si está WHISPER_KEEP_DIR, se guarda una copia
    if (process.env.WHISPER_KEEP_DIR) {
      await mkdir(process.env.WHISPER_KEEP_DIR, { recursive: true });
      await copyFile(wav, path.join(process.env.WHISPER_KEEP_DIR, `${new Date().toISOString().replace(/[:.]/g, "-")}.wav`));
    }

    const prompt = `Chop, cargame nafta 15 lucas. Gastos en pesos: 20 mil, cuotas, débito, crédito, efectivo. ${hints.join(", ")}.`;
    const started = Date.now();
    const { stdout } = await run(
      process.env.WHISPER_CLI!,
      [
        "-m", process.env.WHISPER_MODEL!,
        "-f", wav,
        "-l", "es",
        "-t", process.env.WHISPER_THREADS || "8",
        "--prompt", prompt,
        "-nt", // sin marcas de tiempo
        "-np", // sin mensajes de progreso
      ],
      { timeout: 120_000 },
    );
    // "Chop, cargame...": el nombre del bot al principio no es parte del gasto (y Whisper a veces
    // lo escucha como "Job", "Shop" o "Chof")
    const text = stdout
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^(chop|chopp|job|shop|chof|chap|yop)\b[\s,.!¡]*/i, "");
    console.log(`[whisper] ${seconds.toFixed(1)} s de audio en ${((Date.now() - started) / 1000).toFixed(1)} s: "${text}"`);
    return text ? { ok: true, text } : { ok: false, reason: "empty" };
  } catch (e) {
    console.error("[whisper]", e instanceof Error ? e.message : e);
    return { ok: false, reason: "error" };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Lo que contesta Chop cuando no pudo pasar el audio a texto */
export function transcriptionProblem(reason: Exclude<Transcription, { ok: true }>["reason"]) {
  return {
    off: "Todavía no escucho audios 🙉 Escribímelo y lo cargo al toque, o escribí *menu* para ver las opciones.",
    long: `Ese audio es muy largo 😅 Mandame uno de menos de ${MAX_AUDIO_SECONDS} segundos, o escribímelo.`,
    empty: "No escuché nada en ese audio 🤔 ¿Probás de nuevo, o me lo escribís?",
    error: "No pude escuchar ese audio 😕 ¿Probás de nuevo, o me lo escribís?",
  }[reason];
}
