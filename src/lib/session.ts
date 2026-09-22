import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { Role } from "@/generated/prisma/client";

// La sesión vive en una cookie firmada (JWT). La firma con AUTH_SECRET impide
// que alguien la modifique: si cambia un solo carácter, la verificación falla.

export type SessionPayload = { userId: string; role: Role };

const COOKIE_NAME = "session";
const DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 días

function getKey() {
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
    return { userId: payload.userId, role: payload.role };
  } catch {
    return null; // firma inválida o vencida
  }
}

export async function createSession(payload: SessionPayload) {
  const expiresAt = new Date(Date.now() + DURATION_MS);
  const token = await encrypt(payload, expiresAt);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true, // el JavaScript del navegador no puede leerla
    secure: process.env.NODE_ENV === "production", // solo por HTTPS en producción
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
}

export async function readSession() {
  const cookieStore = await cookies();
  return decrypt(cookieStore.get(COOKIE_NAME)?.value);
}

export async function deleteSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
