import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL } from "@/components/marketing/legal/config";
import { InShort, LegalPage, LegalSection, LegalTable, toc } from "@/components/marketing/legal/shell";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description: `The cookies and browser storage ${LEGAL.brand} uses. One sign-in cookie, a few preferences, and no tracking or advertising cookies.`,
  alternates: { canonical: "/legal/cookies" },
};

const TOC = toc([
  ["what", "What cookies are"],
  ["we-use", "What we use"],
  ["third-party", "Third parties"],
  ["no-tracking", "No tracking or advertising"],
  ["control", "Your choices"],
  ["changes", "Changes"],
]);

export default function CookiesPage() {
  return (
    <LegalPage
      slug="cookies"
      toc={TOC}
      intro={
        <InShort>
          <ul>
            <li>We set one cookie, and only after you sign in — it keeps you signed in.</li>
            <li>A few small preferences (like light or dark mode) stay in your browser’s local storage.</li>
            <li>No analytics, advertising or cross-site tracking cookies, so there’s nothing to opt out of.</li>
          </ul>
        </InShort>
      }
    >
      <LegalSection id="what" title="1. What cookies are">
        <p>
          Cookies are small text files a website stores in your browser. Local storage and session storage are similar browser features that keep small pieces of data on your device. We
          call them all “cookies” in this policy.
        </p>
      </LegalSection>

      <LegalSection id="we-use" title="2. What we use">
        <LegalTable
          head={["Name", "Type", "Purpose", "Lasts"]}
          rows={[
            [<code key="c">{LEGAL.sessionCookie}</code>, "Cookie — strictly necessary", "Keeps you signed in and protects your account. HttpOnly, sent only to our site, HTTPS-only in production.", `Until you sign out, or ${LEGAL.sessionDays} days without activity`],
            [<code key="c">theme</code>, "Local storage — preference", "Remembers light, dark or system theme", "Until you clear it"],
            [<code key="c">ref</code>, "Local storage — functional", "Remembers a referral code from a link until you finish signing up", "Removed after sign-up"],
            [<code key="c">docs:lang</code>, "Local storage — preference", "Remembers your preferred language for code samples in the docs", "Until you clear it"],
          ]}
        />
        <p>Because these are strictly necessary for the Service or simply remember choices you made, we don’t show a cookie banner.</p>
      </LegalSection>

      <LegalSection id="third-party" title="3. Third parties">
        <ul>
          <li>
            <strong>Google sign-in</strong> — if you choose “Continue with Google”, Google loads its sign-in button and may set its own cookies under the{" "}
            <a href="https://policies.google.com/technologies/cookies" target="_blank" rel="noreferrer">
              Google cookie policy
            </a>
            .
          </li>
          <li>
            <strong>Image delivery</strong> — images may load from our file storage provider’s content network, which receives standard request information such as your IP address
            and browser.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="no-tracking" title="4. No tracking or advertising">
        <p>
          We don’t use analytics, advertising, social media or cross-site tracking cookies, and we don’t let third parties track you on our site. If that ever changes, we’ll update this
          policy and ask for your consent where the law requires it.
        </p>
      </LegalSection>

      <LegalSection id="control" title="5. Your choices">
        <p>
          You can delete or block cookies and local storage in your browser settings. If you block the <code>{LEGAL.sessionCookie}</code> cookie you won’t be able to sign in, but the
          public pages will still work. See our <Link href="/legal/privacy">Privacy Policy</Link> for how we handle personal data.
        </p>
      </LegalSection>

      <LegalSection id="changes" title="6. Changes">
        <p>We’ll update this page and the date at the top if the cookies we use change.</p>
      </LegalSection>
    </LegalPage>
  );
}
