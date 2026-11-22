import { describe, expect, it } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import { verifyFirebaseIdToken } from "../src/lib/firebase";

const PROJECT = "fz-craft-test";

async function setup() {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256" };
  const keys = createLocalJWKSet({ keys: [jwk] });
  const now = Math.floor(Date.now() / 1000);
  const sign = (claims: Record<string, unknown> = {}, opts: { iss?: string; aud?: string; exp?: number; key?: Parameters<SignJWT["sign"]>[0] } = {}) =>
    new SignJWT({
      email: "Ali@Example.com",
      email_verified: true,
      name: "Ali",
      auth_time: now - 10,
      firebase: { sign_in_provider: "google.com", identities: { "google.com": ["1234567890"], email: ["ali@example.com"] } },
      ...claims,
    })
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setSubject("firebase-uid-1")
      .setIssuer(opts.iss ?? `https://securetoken.google.com/${PROJECT}`)
      .setAudience(opts.aud ?? PROJECT)
      .setIssuedAt(now - 10)
      .setExpirationTime(opts.exp ?? now + 3600)
      .sign(opts.key ?? privateKey);
  return { keys, sign, now };
}

describe("Firebase ID token check", () => {
  it("accepts a valid Google sign-in and reads the Google account id", async () => {
    const { keys, sign } = await setup();
    const id = await verifyFirebaseIdToken(await sign(), PROJECT, keys);
    expect(id).toEqual({ uid: "firebase-uid-1", email: "ali@example.com", emailVerified: true, name: "Ali", provider: "google.com", googleSub: "1234567890", githubId: null });
  });

  it("rejects a token for another Firebase project", async () => {
    const { keys, sign } = await setup();
    await expect(verifyFirebaseIdToken(await sign({}, { aud: "someone-else" }), PROJECT, keys)).rejects.toThrow();
    await expect(verifyFirebaseIdToken(await sign({}, { iss: "https://securetoken.google.com/someone-else" }), PROJECT, keys)).rejects.toThrow();
  });

  it("rejects an expired token", async () => {
    const { keys, sign, now } = await setup();
    await expect(verifyFirebaseIdToken(await sign({}, { exp: now - 3600 }), PROJECT, keys)).rejects.toThrow();
  });

  it("rejects a token signed with someone else's key", async () => {
    const { keys, sign } = await setup();
    const other = await generateKeyPair("RS256");
    await expect(verifyFirebaseIdToken(await sign({}, { key: other.privateKey }), PROJECT, keys)).rejects.toThrow();
  });

  it("rejects a sign-in time in the future", async () => {
    const { keys, sign, now } = await setup();
    await expect(verifyFirebaseIdToken(await sign({ auth_time: now + 3600 }), PROJECT, keys)).rejects.toThrow();
  });

  it("reads the GitHub account id from a GitHub sign-in", async () => {
    const { keys, sign } = await setup();
    const id = await verifyFirebaseIdToken(await sign({ email_verified: false, firebase: { sign_in_provider: "github.com", identities: { "github.com": ["583231"] } } }), PROJECT, keys);
    expect(id).toMatchObject({ provider: "github.com", githubId: "583231", googleSub: null, emailVerified: false });
  });

  it("reports other sign-in methods so the route can refuse them", async () => {
    const { keys, sign } = await setup();
    const id = await verifyFirebaseIdToken(await sign({ firebase: { sign_in_provider: "password", identities: { email: ["ali@example.com"] } } }), PROJECT, keys);
    expect(id.provider).toBe("password");
    expect(id.googleSub).toBeNull();
  });
});
