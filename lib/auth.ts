import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { JWT_SECRET_ENV } from "@/lib/env";

const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_ENV);
const JWT_EXPIRY = "7d";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function signToken(username: string): Promise<string> {
  return new SignJWT({ sub: username })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRY)
    .sign(JWT_SECRET);
}

export async function verifyToken(
  token: string
): Promise<{ username: string } | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const sub = payload.sub;
    if (typeof sub !== "string") return null;
    return { username: sub };
  } catch (err) {
    // Log unexpected errors (misconfigured secret, crypto failure) but not
    // expected invalid-token errors from jwtVerify.
    if (err instanceof Error && err.name !== "JWTExpired" && !String(err).includes("signature")) {
      console.error("[auth] verifyToken unexpected error:", err);
    }
    return null;
  }
}

export function extractToken(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7);
}
