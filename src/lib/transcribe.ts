import "server-only";

// Pasa un audio a texto. Todavía no está conectado: devuelve null y Chop contesta que
// aún no entiende audios. Cuando sumemos Whisper (u otro servicio de transcripción),
// se implementa solo esta función y el chat de la web la empieza a usar sola.
// Más adelante también la puede usar el webhook de WhatsApp para los audios que llegan ahí.
export async function transcribeAudio(audio: File): Promise<string | null> {
  void audio; // todavía sin usar
  return null;
}
