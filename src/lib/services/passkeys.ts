import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies, headers } from "next/headers";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { db } from "@/lib/db";
import { getKey } from "@/lib/session";

// Entrar con huella o cara (passkeys, WebAuthn). Cómo funciona:
// 1. El servidor manda un "desafío" (bytes al azar) y lo guarda unos minutos en una cookie firmada.
// 2. El celular pide la huella y, si es la de su dueño, firma el desafío con una clave privada que
//    nunca sale del dispositivo. La huella tampoco sale: solo destraba la clave.
// 3. El servidor verifica la firma con la clave pública que guardó al registrar el dispositivo.
// La passkey queda atada al dominio (rpID): una página falsa con otro dominio no puede usarla.

const CHALLENGE_COOKIE = "passkey-challenge";
const CHALLENGE_MS = 5 * 60 * 1000; // 5 minutos para poner la huella

export class PasskeyError extends Error {}

/**
 * Dominio y origen de las passkeys. En producción, los de APP_URL (salt.estilo.ar): así quedan
 * atadas a ese dominio aunque alguien mande otro Host. En desarrollo, el dominio con el que se
 * entró (localhost o un túnel): el navegador acepta localhost sin HTTPS.
 */
async function relyingParty() {
  if (process.env.NODE_ENV === "production") {
    if (!process.env.APP_URL) throw new Error("Falta APP_URL en el .env (lo necesitan las passkeys)");
    const url = new URL(process.env.APP_URL);
    return { rpID: url.hostname, origin: url.origin };
  }
  const h = await headers();
  const host = h.get("host") ?? "localhost";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return { rpID: host.split(":")[0], origin: `${proto}://${host}` };
}

type ChallengePayload = { challenge: string; userId?: string };

async function saveChallenge(payload: ChallengePayload) {
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(new Date(Date.now() + CHALLENGE_MS))
    .sign(getKey());
  const cookieStore = await cookies();
  cookieStore.set(CHALLENGE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: CHALLENGE_MS / 1000,
    path: "/",
  });
}

/** El desafío guardado, y se borra: cada uno sirve una sola vez */
async function takeChallenge(): Promise<ChallengePayload> {
  const cookieStore = await cookies();
  const token = cookieStore.get(CHALLENGE_COOKIE)?.value;
  cookieStore.delete(CHALLENGE_COOKIE);
  try {
    if (!token) throw new Error();
    const { payload } = await jwtVerify<ChallengePayload>(token, getKey(), { algorithms: ["HS256"] });
    return payload;
  } catch {
    throw new PasskeyError("Pasó mucho tiempo. Probá de nuevo.");
  }
}

/** "Android · Chrome": para reconocer cada dispositivo en la lista de Mi cuenta */
function deviceName(userAgent: string) {
  const os =
    [
      [/iPhone/, "iPhone"],
      [/iPad/, "iPad"],
      [/Android/, "Android"],
      [/Windows/, "Windows"],
      [/Mac OS X|Macintosh/, "Mac"],
      [/Linux/, "Linux"],
    ].find(([re]) => (re as RegExp).test(userAgent))?.[1] ?? "Dispositivo";
  // El orden importa: Edge y Samsung también dicen "Chrome", y Chrome también dice "Safari"
  const browser = [
    [/Edg\//, "Edge"],
    [/SamsungBrowser/, "Samsung Internet"],
    [/Firefox|FxiOS/, "Firefox"],
    [/Chrome|CriOS/, "Chrome"],
    [/Safari/, "Safari"],
  ].find(([re]) => (re as RegExp).test(userAgent))?.[1];
  return browser ? `${os} · ${browser}` : (os as string);
}

/** Paso 1 de agregar un dispositivo: las opciones para que el navegador cree la passkey */
export async function registrationOptions(user: { id: string; name: string; email: string }) {
  const { rpID } = await relyingParty();
  const existing = await db.passkey.findMany({ where: { userId: user.id }, select: { credentialId: true, transports: true } });
  const options = await generateRegistrationOptions({
    rpName: "Salt",
    rpID,
    userID: new TextEncoder().encode(user.id),
    userName: user.email,
    userDisplayName: user.name,
    attestationType: "none",
    // Si este dispositivo ya tiene una passkey de esta cuenta, el navegador avisa en vez de crear otra
    excludeCredentials: existing.map((p) => ({ id: p.credentialId, transports: p.transports })),
    authenticatorSelection: {
      residentKey: "required", // queda guardada en el dispositivo: se entra sin escribir el email
      userVerification: "required", // pide la huella, la cara o el PIN del celular
    },
  });
  await saveChallenge({ challenge: options.challenge, userId: user.id });
  return options;
}

/** Paso 2: verifica lo que creó el navegador y guarda la clave pública */
export async function registerPasskey(userId: string, response: RegistrationResponseJSON) {
  const { challenge, userId: challengeUser } = await takeChallenge();
  if (challengeUser !== userId) throw new PasskeyError("Pasó mucho tiempo. Probá de nuevo.");
  const { rpID, origin } = await relyingParty();

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
  } catch {
    throw new PasskeyError("No se pudo verificar el dispositivo. Probá de nuevo.");
  }
  if (!verification.verified) throw new PasskeyError("No se pudo verificar el dispositivo. Probá de nuevo.");

  const { credential } = verification.registrationInfo;
  const h = await headers();
  await db.passkey.create({
    data: {
      userId,
      credentialId: credential.id,
      publicKey: credential.publicKey,
      counter: credential.counter,
      transports: credential.transports ?? [],
      name: deviceName(h.get("user-agent") ?? ""),
    },
  });
}

/** Paso 1 de entrar: un desafío sin decir de qué cuenta (el celular ofrece las que tiene guardadas) */
export async function authenticationOptions() {
  const { rpID } = await relyingParty();
  const options = await generateAuthenticationOptions({ rpID, userVerification: "required" });
  await saveChallenge({ challenge: options.challenge });
  return options;
}

/** Paso 2: verifica la firma. Devuelve la cuenta para abrirle la sesión */
export async function verifyPasskeyLogin(response: AuthenticationResponseJSON) {
  const { challenge } = await takeChallenge();
  const passkey = await db.passkey.findUnique({ where: { credentialId: response.id }, include: { user: true } });
  if (!passkey) {
    // Se borró desde Mi cuenta o al cambiar la contraseña, pero sigue guardada en el celular
    throw new PasskeyError("Ese acceso con huella ya no vale. Entrá con tu contraseña y volvé a agregarlo desde Mi cuenta.");
  }
  if (!passkey.user.active) throw new PasskeyError("Esta cuenta está desactivada.");
  const { rpID, origin } = await relyingParty();

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: passkey.credentialId,
        publicKey: new Uint8Array(passkey.publicKey),
        counter: passkey.counter,
        transports: passkey.transports,
      },
      requireUserVerification: true,
    });
  } catch {
    throw new PasskeyError("No se pudo verificar la huella. Probá de nuevo o entrá con tu contraseña.");
  }
  if (!verification.verified) {
    throw new PasskeyError("No se pudo verificar la huella. Probá de nuevo o entrá con tu contraseña.");
  }

  await db.passkey.update({
    where: { id: passkey.id },
    data: { counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() },
  });
  return passkey.user;
}

export function listPasskeys(userId: string) {
  return db.passkey.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, createdAt: true, lastUsedAt: true },
  });
}

/** Borra una passkey de la persona (el filtro por userId evita borrar las de otro) */
export async function deletePasskey(userId: string, id: string) {
  await db.passkey.deleteMany({ where: { id, userId } });
}
