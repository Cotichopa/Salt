import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { Role } from "@/generated/prisma/client";

// La sesión vive en una cookie firmada (JWT). La firma con AUTH_SECRET impide
// que alguien la modifique: si cambia un solo carácter, la verificación falla.

// `ver` es la sessionVersion del usuario al entrar: si después cambia la contraseña, ya no coincide
// y la sesión deja de valer (lo revisa src/lib/dal.ts). Las cookies de antes de esto no la traen: 0.
export type SessionPayload = { userId: string; role: Role; ver: number };

const COOKIE_NAME = "session";
const DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 días
// Mientras se use la app, la sesión se renueva (como mucho una vez por día): solo vence si pasás
// 30 días sin abrirla. Así, instalada en el celular, no pide el login todos los meses.
const RENEW_AFTER_MS = 24 * 60 * 60 * 1000;

// También firma el desafío de las passkeys (src/lib/services/passkeys.ts)
export function getKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("Falta AUTH_SECRET en el .env");
  return new TextEncoder().encode(secret);
}

export async function encrypt(payload: SessionPayload, expiresAt: Date) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(getKey());
}

export async function decrypt(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify<SessionPayload>(token, getKey(), { algorithms: ["HS256"] });
    return { userId: payload.userId, role: payload.role, ver: payload.ver ?? 0 };
  } catch {
    return null; // firma inválida o vencida
  }
}

function cookieOptions(expires: Date) {
  return {
    httpOnly: true, // el JavaScript del navegador no puede leerla
    secure: process.env.NODE_ENV === "production", // solo por HTTPS en producción
    sameSite: "lax" as const,
    expires,
    path: "/",
  };
}

export async function createSession(payload: SessionPayload) {
  const expiresAt = new Date(Date.now() + DURATION_MS);
  const token = await encrypt(payload, expiresAt);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, cookieOptions(expiresAt));
}

/**
 * La cookie renovada (30 días desde hoy) si la sesión es válida y tiene más de un día; si no, null.
 * La usa el proxy en cada pedido.
 */
export async function renewedSession(token: string | undefined) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify<SessionPayload>(token, getKey(), { algorithms: ["HS256"] });
    if (!payload.iat || Date.now() - payload.iat * 1000 < RENEW_AFTER_MS) return null;
    const expiresAt = new Date(Date.now() + DURATION_MS);
    const value = await encrypt({ userId: payload.userId, role: payload.role, ver: payload.ver ?? 0 }, expiresAt);
    return { name: COOKIE_NAME, value, options: cookieOptions(expiresAt) };
  } catch {
    return null;
  }
}

export async function readSession() {
  const cookieStore = await cookies();
  return decrypt(cookieStore.get(COOKIE_NAME)?.value);
}

export async function deleteSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
  cookieStore.delete("view-as"); // si el superadmin estaba mirando otra cuenta (dal.ts, VIEW_AS_COOKIE)
}
