import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL } from "@/components/marketing/legal/config";
import { InShort, LegalPage, LegalSection, LegalTable, toc } from "@/components/marketing/legal/shell";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `How ${LEGAL.brand} collects, uses, shares and protects personal data, how long it is kept, and the choices you have.`,
  alternates: { canonical: "/legal/privacy" },
};

const TOC = toc([
  ["who-we-are", "Who we are"],
  ["what-we-collect", "Information we collect"],
  ["how-we-use", "How we use information"],
  ["legal-bases", "Legal bases"],
  ["sharing", "Who we share it with"],
  ["transfers", "International transfers"],
  ["retention", "How long we keep it"],
  ["security", "Security"],
  ["your-rights", "Your rights and choices"],
  ["children", "Children"],
  ["changes", "Changes to this policy"],
  ["contact", "Contact"],
]);

export default function PrivacyPage() {
  return (
    <LegalPage
      slug="privacy"
      toc={TOC}
      intro={
        <>
          <p>
            This policy explains how {LEGAL.who} (“we”, “us”) handles personal data when you use our website at {LEGAL.host}, the API, the Playground, Image Studio
            and related services (together, the “Service”).
          </p>
          <InShort>
            <ul>
              <li>We don’t sell your data, show ads or use third-party analytics.</li>
              <li>
                We don’t store the text of your API requests or responses — only usage metadata such as tokens, cost and timing, kept for {LEGAL.logDays} days.
              </li>
              <li>
                Generated images and their prompts are deleted after {LEGAL.imageHours} hours. Playground chats stay until you delete them.
              </li>
              <li>Your prompts are passed to the AI provider that serves the model you choose, under that provider’s own terms.</li>
              <li>You can delete your account at any time from Settings.</li>
            </ul>
          </InShort>
        </>
      }
    >
      <LegalSection id="who-we-are" title="1. Who we are">
        <p>
          {LEGAL.hasEntity ? `${LEGAL.entity} operates ${LEGAL.brand} and is` : `${LEGAL.brand} is`} responsible for your personal data under this policy. You can reach us at{" "}
          <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>.
        </p>
      </LegalSection>

      <LegalSection id="what-we-collect" title="2. Information we collect">
        <h3>Information you give us</h3>
        <ul>
          <li>
            <strong>Account details</strong> — email address, name, and a phone number if you add one. Passwords are stored only as a salted hash (scrypt); we can never see them.
          </li>
          <li>
            <strong>Sign-in and verification</strong> — if you use Google sign-in, your Google account ID, email and name. If you verify with Telegram, your Telegram user ID and username.
          </li>
          <li>
            <strong>Payments</strong> — the amount, method and status of each payment; Binance Pay order IDs or blockchain transaction hashes (and the public details recorded on the
            blockchain for that transaction, such as the sending wallet address); and, for JazzCash, Easypaisa or bank transfers, the reference number and the screenshot you upload.
          </li>
          <li>
            <strong>Support and feedback</strong> — tickets, replies and feedback you send us.
          </li>
          <li>
            <strong>Content you create</strong> — Playground conversations (messages, attachments and settings), and Image Studio prompts, reference images and generated images.
          </li>
        </ul>

        <h3>Information collected automatically</h3>
        <ul>
          <li>
            <strong>API usage metadata</strong> — for every request: time, endpoint, model, API key used, token counts, cost at model price, latency, status or error code, IP address and
            user agent. <strong>We do not store the content of chat completion or embedding requests and responses.</strong> Image generation is the exception: the prompt and the images
            are stored temporarily so you can view and download them (see <a href="#retention">retention</a>).
          </li>
          <li>
            <strong>Security data</strong> — active sign-in sessions with the IP address and browser that created them, two-factor settings (the secret is encrypted) and short-lived
            one-time codes.
          </li>
          <li>
            <strong>Referrals</strong> — which account referred you, if you signed up with a referral link or code.
          </li>
          <li>
            <strong>Cookies and local storage</strong> — only what’s needed to keep you signed in and remember simple preferences. See the <Link href="/legal/cookies">Cookie Policy</Link>.
          </li>
        </ul>

        <h3>API keys</h3>
        <p>
          We store a one-way hash of each API key to authenticate requests, plus an encrypted copy so you can reveal the key again in your dashboard. Upstream provider keys used by our
          platform are also stored encrypted.
        </p>
      </LegalSection>

      <LegalSection id="how-we-use" title="3. How we use information">
        <ul>
          <li>To create and secure your account, sign you in and protect it with two-factor authentication.</li>
          <li>To run the Service: route requests to model providers, enforce rate limits and quotas, and meter token and image usage.</li>
          <li>To process payments, verify crypto transactions automatically, review manual transfers and keep billing records.</li>
          <li>To prevent fraud and abuse — for example multiple free accounts, payment fraud or use that breaks our Acceptable Use Policy.</li>
          <li>To send service messages by email, in the dashboard or on Telegram: sign-in codes, payment confirmations, usage alerts and important changes.</li>
          <li>To answer support requests and improve reliability using aggregated, non-identifying statistics.</li>
          <li>To meet legal, tax and accounting obligations and to enforce our terms.</li>
        </ul>
        <p>
          We do not sell personal data, use it for advertising, or use your prompts or outputs to train models.
        </p>
      </LegalSection>

      <LegalSection id="legal-bases" title="4. Legal bases">
        <p>Where the law requires a legal basis (for example in the EU or UK), we rely on:</p>
        <ul>
          <li>
            <strong>Contract</strong> — to provide the Service you signed up for and process your payments.
          </li>
          <li>
            <strong>Legitimate interests</strong> — to keep the Service secure, prevent abuse and improve it, balanced against your rights.
          </li>
          <li>
            <strong>Legal obligation</strong> — to keep financial records and respond to lawful requests.
          </li>
          <li>
            <strong>Consent</strong> — where we ask for it, such as optional Telegram notifications. You can withdraw consent at any time.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="sharing" title="5. Who we share it with">
        <p>We share personal data only with the service providers that help us run {LEGAL.brand}, and only what each one needs:</p>
        <LegalTable
          head={["Who", "Why", "What they receive"]}
          rows={[
            ["AI model providers", "To generate the response for the model you choose", "Your prompts, attachments and generation settings, and the model’s output. They process it under their own terms and may keep it for a limited time for abuse monitoring."],
            ["Database hosting (MongoDB Atlas)", "Stores account, usage and billing records", "All data described in this policy"],
            ["Server hosting", "Runs the website and API, and stores uploaded and generated files", "Data in transit, server logs, and stored files (generated and reference images, chat attachments, payment screenshots)"],
            ["Google", "Optional Google sign-in", "Sign-in request; Google returns your account ID, name and email"],
            ["Telegram", "Account verification and optional notifications", "Your Telegram ID and the messages we send you"],
            ["Email delivery provider", "Sign-in codes and service emails", "Your email address and the message content"],
            ["Binance and BNB Smart Chain", "Verifying crypto payments", "Order IDs and transaction hashes; blockchain data is public by nature"],
            ["Web search provider", "Playground web search, when you turn it on", "The search queries generated for your question"],
          ]}
        />
        <p>
          We may also disclose information if required by law or a valid legal request, to protect the rights, safety or property of our users or the public, or as part of a merger,
          acquisition or sale of assets — in which case this policy will continue to apply to your data.
        </p>
      </LegalSection>

      <LegalSection id="transfers" title="6. International transfers">
        <p>
          Our service providers, and the AI providers that serve each model, may process data in countries other than yours, including the United States, the European Union and Asia.
          Where required, we rely on appropriate safeguards such as contractual commitments from those providers.
        </p>
      </LegalSection>

      <LegalSection id="retention" title="7. How long we keep it">
        <LegalTable
          head={["Data", "Kept for"]}
          rows={[
            ["Account profile", "While your account is open. On deletion your name, email, phone and sign-in links are removed."],
            ["API usage metadata", `${LEGAL.logDays} days, then deleted automatically`],
            ["Generated images, their prompts and Image Studio history", `${LEGAL.imageHours} hours, then deleted automatically`],
            ["Playground conversations and attachments", "Until you delete them or your account"],
            ["Notifications", `${LEGAL.notificationDays} days`],
            ["Sign-in sessions", `Until you sign out, or after ${LEGAL.sessionDays} days without activity`],
            ["One-time email codes", `${LEGAL.otpMinutes} minutes`],
            ["Payments, invoices, wallet transactions and payment screenshots", "As long as needed for accounting, tax and dispute purposes — kept after account deletion, separated from your profile"],
            ["Support tickets", "For the life of the account so we can help you consistently; ask us to delete them"],
          ]}
        />
      </LegalSection>

      <LegalSection id="security" title="8. Security">
        <p>
          We use HTTPS for all traffic, hash passwords and API keys, encrypt stored secrets with AES-256-GCM, keep private files behind signed access, limit staff access, and offer
          two-factor authentication. No system is perfectly secure, so please use a strong, unique password, turn on two-factor authentication and keep your API keys private.
        </p>
      </LegalSection>

      <LegalSection id="your-rights" title="9. Your rights and choices">
        <p>Depending on where you live, you may have the right to access, correct, delete, restrict or object to the use of your personal data, and to receive a copy of it.</p>
        <ul>
          <li>
            <strong>Update your details</strong> in Settings at any time.
          </li>
          <li>
            <strong>Delete your account</strong> in Settings. We revoke your API keys, sign you out everywhere, delete your Playground chats, generated images and notifications, and
            remove your name, email, phone and sign-in links. Billing records are kept as described above.
          </li>
          <li>
            <strong>Get a copy</strong> of your data, or ask any privacy question, by emailing <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>. We respond within 30 days.
          </li>
          <li>
            <strong>Control notifications</strong> in Settings. Security and billing messages can’t be turned off while your account is active.
          </li>
          <li>You can also complain to your local data protection authority.</li>
        </ul>
      </LegalSection>

      <LegalSection id="children" title="10. Children">
        <p>
          {LEGAL.brand} is not intended for anyone under 18. We don’t knowingly collect data from children; if you believe a child has created an account, contact us and we will delete it.
        </p>
      </LegalSection>

      <LegalSection id="changes" title="11. Changes to this policy">
        <p>
          We may update this policy as the Service changes. We’ll update the date at the top, and for significant changes we’ll tell you by email or in your dashboard before they take
          effect.
        </p>
      </LegalSection>

      <LegalSection id="contact" title="12. Contact">
        <p>
          {LEGAL.entity}, {LEGAL.country} — <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>
        </p>
      </LegalSection>
    </LegalPage>
  );
}
