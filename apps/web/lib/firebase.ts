/**
 * "Continue with Google" / "Continue with GitHub" through Firebase Auth. Firebase only proves who the
 * person is: the ID token it returns is sent to /api/auth/firebase, which checks it and starts our
 * own session (for GitHub it also gets the GitHub token, to read the verified email from GitHub).
 * Nothing is kept in Firebase on this device (in-memory persistence, signed out right after).
 */
import type { Auth, GithubAuthProvider, GoogleAuthProvider } from "firebase/auth";

export type SocialProvider = "google" | "github";

export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
};

export const firebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId);

type AuthModule = typeof import("firebase/auth");
type Loaded = { auth: Auth; google: GoogleAuthProvider; github: GithubAuthProvider; mod: AuthModule };
let loading: Promise<Loaded> | null = null;

/** Loads the Firebase SDK once. Call early (on mount) so the click can open the popup straight away. */
export function loadFirebase(): Promise<Loaded> {
  if (!loading) {
    loading = (async () => {
      const [{ initializeApp, getApps }, mod] = await Promise.all([import("firebase/app"), import("firebase/auth")]);
      const app = getApps()[0] ?? initializeApp(firebaseConfig);
      const auth = mod.initializeAuth(app, { persistence: mod.inMemoryPersistence, popupRedirectResolver: mod.browserPopupRedirectResolver });
      const google = new mod.GoogleAuthProvider();
      google.setCustomParameters({ prompt: "select_account" });
      const github = new mod.GithubAuthProvider();
      // Lets our server read which of the person's GitHub emails are verified
      github.addScope("user:email");
      return { auth, google, github, mod };
    })();
    loading.catch(() => (loading = null));
  }
  return loading;
}

/** Opens Google's or GitHub's sign-in window and returns what /api/auth/firebase needs. */
export async function socialSignIn(which: SocialProvider): Promise<{ idToken: string; githubToken?: string }> {
  const fb = await loadFirebase();
  const cred = await fb.mod.signInWithPopup(fb.auth, which === "google" ? fb.google : fb.github);
  const idToken = await cred.user.getIdToken();
  const githubToken = which === "github" ? (fb.mod.GithubAuthProvider.credentialFromResult(cred)?.accessToken ?? undefined) : undefined;
  fb.mod.signOut(fb.auth).catch(() => {});
  return { idToken, githubToken };
}

/** Firebase error codes that just mean "the person closed the window": no message needed. */
export const isCancelled = (code: string) => code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request" || code === "auth/user-cancelled";

/** Friendly text for Firebase sign-in errors. */
export function firebaseErrorMessage(code: string, which: SocialProvider = "google"): string {
  const name = which === "github" ? "GitHub" : "Google";
  switch (code) {
    case "auth/popup-blocked":
      return `Your browser blocked the ${name} window. Allow pop-ups for this site and try again.`;
    case "auth/account-exists-with-different-credential":
      return `This email already signs in with ${which === "github" ? "Google" : "GitHub"}. Use that button instead.`;
    case "auth/unauthorized-domain":
      return "This website isn't allowed in Firebase yet (Authentication → Settings → Authorized domains).";
    case "auth/operation-not-allowed":
      return `${name} sign-in isn't turned on in Firebase yet (Authentication → Sign-in method → ${name}).`;
    case "auth/network-request-failed":
      return `Couldn't reach ${name}. Check your connection and try again.`;
    case "auth/internal-error":
    case "auth/web-storage-unsupported":
      return "This browser blocked the sign-in. Try Chrome or Safari, or turn off strict tracking protection for this site.";
    default:
      return `${name} sign-in failed. Please try again.`;
  }
}

/**
 * Google refuses sign-in inside apps' built-in browsers (Facebook, Instagram, TikTok, WhatsApp…) and
 * pop-ups often fail there too, so people who tap our link there need to open it in Chrome or Safari.
 */
export function inAppBrowser(ua: string): string | null {
  if (/FBAN|FBAV|FB_IAB|FBIOS/i.test(ua)) return "Facebook";
  if (/Instagram/i.test(ua)) return "Instagram";
  if (/musical_ly|BytedanceWebview|TikTok|trill/i.test(ua)) return "TikTok";
  if (/Snapchat/i.test(ua)) return "Snapchat";
  if (/LinkedInApp/i.test(ua)) return "LinkedIn";
  if (/Twitter/i.test(ua)) return "X";
  if (/Line\//i.test(ua)) return "LINE";
  if (/WhatsApp/i.test(ua)) return "WhatsApp";
  // Generic Android WebView ("; wv)") — e.g. links opened inside many chat apps
  if (/Android.*;\s*wv\)/i.test(ua)) return "this app";
  return null;
}
