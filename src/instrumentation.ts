// Corre una vez, al arrancar el servidor (convención de Next.js). Solo en Node: ahí se guardan los
// errores en la base para verlos en el Resumen del superadmin.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { captureServerErrors } = await import("@/lib/server-errors");
    captureServerErrors();
  }
}
