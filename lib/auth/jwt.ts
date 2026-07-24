import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { env } from "@/lib/env";

const accessSecret = new TextEncoder().encode(env.JWT_SECRET);
const refreshSecret = new TextEncoder().encode(env.JWT_REFRESH_SECRET);

export const ACCESS_TTL_SECONDS = 60 * 15; // 15 minutes
export const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export interface AccessTokenPayload extends JWTPayload {
  sub: string;
  role: string;
  instituteId: string | null;
  permissions: string[];
}

export interface RefreshTokenPayload extends JWTPayload {
  sub: string;
  jti: string;
}

export async function signAccessToken(payload: Omit<AccessTokenPayload, "iat" | "exp">) {
  return new SignJWT(payload as JWTPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
    .sign(accessSecret);
}

export async function signRefreshToken(payload: Omit<RefreshTokenPayload, "iat" | "exp">) {
  return new SignJWT(payload as JWTPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${REFRESH_TTL_SECONDS}s`)
    .sign(refreshSecret);
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, accessSecret);
    return payload as AccessTokenPayload;
  } catch {
    return null;
  }
}

export async function verifyRefreshToken(token: string): Promise<RefreshTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, refreshSecret);
    return payload as RefreshTokenPayload;
  } catch {
    return null;
  }
}
