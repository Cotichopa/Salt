import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Solo en desarrollo: permite abrir la app desde 127.0.0.1 o desde el celular en la
  // red de casa (http://192.168.x.x:3001). Sin esto Next.js bloquea sus archivos de
  // desarrollo para esos orígenes y la página queda "muerta" (sin menús ni gráficos).
  allowedDevOrigins: ["127.0.0.1", "192.168.*.*", "10.*.*.*"],
};

export default nextConfig;
