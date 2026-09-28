import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Solo en desarrollo: permite abrir la app desde 127.0.0.1 o desde el celular en la
  // red de casa (http://192.168.x.x:3001). Sin esto Next.js bloquea sus archivos de
  // desarrollo para esos orígenes y la página queda "muerta" (sin menús ni gráficos).
  allowedDevOrigins: ["127.0.0.1", "192.168.*.*", "10.*.*.*"],
  // ffmpeg-static busca su programa en su propia carpeta: si Next lo empaqueta, no lo encuentra.
  // Así se carga tal cual desde node_modules (lo usa src/lib/transcribe.ts para los audios).
  serverExternalPackages: ["ffmpeg-static"],
};

export default nextConfig;
