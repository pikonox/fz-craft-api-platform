/**
 * "Continue with Google" through Firebase Auth. Firebase only proves who the person is: the ID token
 * it returns is sent to /api/auth/firebase, which checks it and starts our own session. Nothing is
 * kept in Firebase on this device (in-memory persistence, signed out right after).
 */
import type { Auth, AuthProvider } from "firebase/auth";

export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
};

export const firebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId);

type Loaded = {
  auth: Auth;
  provider: AuthProvider;
  signInWithPopup: typeof import("firebase/auth").signInWithPopup;
  signOut: typeof import("firebase/auth").signOut;
};
let loading: Promise<Loaded> | null = null;

/** Loads the Firebase SDK once. Call early (on mount) so the click can open the popup straight away. */
export function loadFirebase(): Promise<Loaded> {
  if (!loading) {
    loading = (async () => {
      const [{ initializeApp, getApps }, authMod] = await Promise.all([import("firebase/app"), import("firebase/auth")]);
      const app = getApps()[0] ?? initializeApp(firebaseConfig);
      const auth = authMod.initializeAuth(app, {
        persistence: authMod.inMemoryPersistence,
        popupRedirectResolver: authMod.browserPopupRedirectResolver,
      });
      const provider = new authMod.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      return {
        auth,
        provider,
        signInWithPopup: authMod.signInWithPopup,
        signOut: authMod.signOut,
      };
    })();
    loading.catch(() => (loading = null));
  }
  return loading;
}

/** Opens Google's account chooser and returns a Firebase ID token for our API. */
export async function googleIdToken(): Promise<string> {
  const fb = await loadFirebase();
  const cred = await fb.signInWithPopup(fb.auth, fb.provider);
  const token = await cred.user.getIdToken();
  fb.signOut(fb.auth).catch(() => {});
  return token;
}

/** Firebase error codes that just mean "the person closed the window": no message needed. */
export const isCancelled = (code: string) => code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request" || code === "auth/user-cancelled";

/** Friendly text for Firebase sign-in errors. */
export function firebaseErrorMessage(code: string): string {
  switch (code) {
    case "auth/popup-blocked":
      return "Your browser blocked the Google window. Allow pop-ups for this site and try again.";
    case "auth/unauthorized-domain":
      return "This website isn't allowed in Firebase yet (Authentication → Settings → Authorized domains).";
    case "auth/operation-not-allowed":
      return "Google sign-in isn't turned on in Firebase yet (Authentication → Sign-in method → Google).";
    case "auth/network-request-failed":
      return "Couldn't reach Google. Check your connection and try again.";
    case "auth/internal-error":
    case "auth/web-storage-unsupported":
      return "This browser blocked the sign-in. Try Chrome or Safari, or turn off strict tracking protection for this site.";
    default:
      return "Google sign-in failed. Please try again.";
  }
}

/**
 * Google refuses sign-in inside apps' built-in browsers (Facebook, Instagram, TikTok, WhatsApp…),
 * so people who tap our link there need to open it in Chrome or Safari first.
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
