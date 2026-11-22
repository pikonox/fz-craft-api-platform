import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

/** Google's public keys for Firebase Auth ID tokens (cached and refreshed by jose). */
const JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"));

export type FirebaseIdentity = {
  /** Firebase user id */
  uid: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  /** How they signed in to Firebase, e.g. "google.com" */
  provider: string | null;
  /** The Google account id (same value Google Identity Services calls `sub`) */
  googleSub: string | null;
};

/**
 * Verifies a Firebase Auth ID token the way the Firebase Admin SDK does: RS256 signature from
 * Google's securetoken keys, issuer/audience = this project, not expired, auth_time in the past.
 */
export async function verifyFirebaseIdToken(token: string, projectId: string, keys: JWTVerifyGetKey = JWKS): Promise<FirebaseIdentity> {
  const { payload } = await jwtVerify(token, keys, {
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
    algorithms: ["RS256"],
    clockTolerance: 60,
  });
  const authTime = typeof payload.auth_time === "number" ? payload.auth_time : 0;
  if (!payload.sub || !authTime || authTime > Date.now() / 1000 + 60) throw new Error("Invalid Firebase token");
  const fb = (payload.firebase ?? {}) as { sign_in_provider?: string; identities?: Record<string, unknown[]> };
  const google = fb.identities?.["google.com"]?.[0];
  return {
    uid: payload.sub,
    email: typeof payload.email === "string" ? payload.email.toLowerCase() : null,
    emailVerified: payload.email_verified === true,
    name: typeof payload.name === "string" ? payload.name : null,
    provider: fb.sign_in_provider ?? null,
    googleSub: typeof google === "string" ? google : null,
  };
}
