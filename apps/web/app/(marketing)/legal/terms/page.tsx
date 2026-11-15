import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL } from "@/components/marketing/legal/config";
import { LegalPage, LegalSection, toc } from "@/components/marketing/legal/shell";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: `The terms that govern your use of ${LEGAL.brand}: accounts, API keys, plans, payments, acceptable use and liability.`,
  alternates: { canonical: "/legal/terms" },
};

const TOC = toc([
  ["agreement", "Agreement"],
  ["eligibility", "Eligibility and accounts"],
  ["service", "The Service"],
  ["api-keys", "API keys"],
  ["plans", "Plans, tokens and wallets"],
  ["payments", "Payments"],
  ["refunds", "Refunds"],
  ["use", "Acceptable use"],
  ["content", "Your content and outputs"],
  ["third-parties", "Third-party models and services"],
  ["suspension", "Suspension and termination"],
  ["disclaimers", "Disclaimers"],
  ["liability", "Limitation of liability"],
  ["indemnity", "Indemnity"],
  ["changes", "Changes"],
  ["law", "Governing law"],
  ["contact", "Contact"],
]);

export default function TermsPage() {
  return (
    <LegalPage
      slug="terms"
      toc={TOC}
      intro={
        <p>
          These Terms of Service (“Terms”) are a binding agreement between you and {LEGAL.who} (“we”, “us”). Please read them carefully — by creating an account,
          calling the API or otherwise using the Service you accept them.
        </p>
      }
    >
      <LegalSection id="agreement" title="1. Agreement">
        <p>
          These Terms cover the website at {LEGAL.host}, the API at <code>{LEGAL.site}/v1</code>, the dashboard, Playground, Image Studio and any related services (the “Service”). Our{" "}
          <Link href="/legal/privacy">Privacy Policy</Link>, <Link href="/legal/refunds">Refund Policy</Link>, <Link href="/legal/acceptable-use">Acceptable Use Policy</Link>,{" "}
          <Link href="/legal/cookies">Cookie Policy</Link> and <Link href="/legal/disclaimer">Disclaimer</Link> form part of these Terms.
        </p>
        <p>If you use the Service for an organisation, you confirm you are authorised to accept these Terms on its behalf, and “you” includes that organisation.</p>
      </LegalSection>

      <LegalSection id="eligibility" title="2. Eligibility and accounts">
        <ul>
          <li>You must be at least 18 years old, or the age of majority where you live, and able to form a binding contract.</li>
          <li>Give accurate information and keep it up to date. You are responsible for everything that happens in your account.</li>
          <li>
            Each person may have <strong>one free account</strong>. The free tier may require Telegram verification. Creating extra accounts to collect more free tokens or referral
            rewards is not allowed.
          </li>
          <li>Keep your password and two-factor codes private and tell us straight away if you suspect someone else has access.</li>
        </ul>
      </LegalSection>

      <LegalSection id="service" title="3. The Service">
        <p>
          {LEGAL.brand} gives you one OpenAI-compatible endpoint for AI models run by third-party providers. We route each request to an available provider, meter usage and bill it to
          your account.
        </p>
        <ul>
          <li>We may add, change, rename, put into maintenance or remove models and features at any time. We’ll try to give notice of changes that significantly affect you.</li>
          <li>Prices for future purchases may change. A change never affects a plan or pass you have already paid for during its current period.</li>
          <li>
            We aim for high availability but don’t guarantee that the Service or any model will be uninterrupted, error-free or available at a particular speed, unless we agree an SLA
            with you in writing.
          </li>
          <li>Rate limits, quotas and model access depend on your plan and are shown in your dashboard and documentation.</li>
        </ul>
      </LegalSection>

      <LegalSection id="api-keys" title="4. API keys">
        <ul>
          <li>API keys are secret. Don’t share them publicly or put them in client-side code, mobile apps or public repositories.</li>
          <li>You are responsible for all usage and charges made with your keys, including by anyone you give access to.</li>
          <li>You may build and sell your own products on top of the Service, but you may not resell, share or expose raw API keys or create a proxy that gives others direct access to our API without our written permission.</li>
          <li>We may revoke a key that appears to be compromised or misused, and will tell you when we do.</li>
        </ul>
      </LegalSection>

      <LegalSection id="plans" title="5. Plans, tokens and wallets">
        <ul>
          <li>
            <strong>Monthly plans</strong> include a token allowance for each billing period. Unused tokens don’t carry over to the next period.
          </li>
          <li>
            <strong>24-hour passes</strong> add tokens that are used before your plan’s allowance and expire 24 hours after purchase.
          </li>
          <li>
            <strong>Bonus tokens</strong> (for example from referrals or promotions) have no cash value and may be removed if they were obtained by breaking these Terms.
          </li>
          <li>
            <strong>Account balance and image wallet</strong> are prepaid credit in USD for buying plans, passes and images on {LEGAL.brand}. They are not a bank account or e-money,
            earn no interest, can’t be transferred to another account and can’t be withdrawn as cash, except as described in the Refund Policy.
          </li>
          <li>
            <strong>Images</strong> are charged per image from the image wallet at the price shown before you generate. Images that fail are not charged.
          </li>
          <li>The “value at model price” shown in your usage reports is for information only — you pay the plan, pass or image prices shown at purchase.</li>
        </ul>
      </LegalSection>

      <LegalSection id="payments" title="6. Payments">
        <ul>
          <li>Prices are in US dollars. Payments in Pakistani rupees use the exchange rate shown at checkout.</li>
          <li>
            <strong>Binance Pay and USDT (BEP-20)</strong> are verified automatically. You must send the exact amount shown, in USDT, on BNB Smart Chain, to the address or merchant shown
            at checkout. Payments sent on another network, in another token, to another address or for a different amount may be delayed or permanently lost — blockchain transactions
            cannot be reversed.
          </li>
          <li>
            <strong>JazzCash, Easypaisa and bank transfers</strong> are reviewed manually after you submit the reference number and a screenshot. Credit is added once we can confirm the
            payment.
          </li>
          <li>
            Unpaid orders expire after {LEGAL.autoOrderHours} hours for automatic methods and {LEGAL.manualOrderHours} hours for manual ones. If you paid after an order expired, contact
            us with the reference and we’ll match it.
          </li>
          <li>You are responsible for any network, bank or exchange fees, and for any taxes that apply to you.</li>
          <li>We may refuse, hold or reverse credit for payments we reasonably believe are fraudulent, duplicated or made with funds you aren’t entitled to use.</li>
        </ul>
      </LegalSection>

      <LegalSection id="refunds" title="7. Refunds">
        <p>
          Refunds are covered by our <Link href="/legal/refunds">Refund Policy</Link>. In short: your first paid monthly plan can be refunded to your balance within {LEGAL.refundHours}{" "}
          hours of purchase; other purchases are final except where the policy or the law says otherwise.
        </p>
      </LegalSection>

      <LegalSection id="use" title="8. Acceptable use">
        <p>
          You must follow our <Link href="/legal/acceptable-use">Acceptable Use Policy</Link> and the usage policies of the providers whose models you use, and comply with all laws that
          apply to you. You may not attack, overload, reverse engineer or try to get around the limits or security of the Service.
        </p>
      </LegalSection>

      <LegalSection id="content" title="9. Your content and outputs">
        <ul>
          <li>
            As between you and us, you keep your rights in the prompts, files and other input you send (“Input”), and to the extent the law allows, you own the output generated for you
            (“Output”). Model providers’ terms may also apply to Output.
          </li>
          <li>You give us permission to host, process and transmit your Input and Output only as needed to run the Service for you and as described in our Privacy Policy.</li>
          <li>You are responsible for your Input, for having the rights to it, and for how you use Output. Output may not be unique — other users may receive similar results.</li>
          <li>We don’t use your Input or Output to train models.</li>
        </ul>
      </LegalSection>

      <LegalSection id="third-parties" title="10. Third-party models and services">
        <p>
          Models are operated by independent third-party providers. Their availability, behaviour and output are outside our control, and model names and logos belong to their owners.{" "}
          {LEGAL.brand} is not affiliated with or endorsed by those companies — see the <Link href="/legal/disclaimer">Disclaimer</Link>.
        </p>
      </LegalSection>

      <LegalSection id="suspension" title="11. Suspension and termination">
        <ul>
          <li>You can stop using the Service and delete your account at any time in Settings.</li>
          <li>
            We may suspend or close your account, or revoke keys, if you break these Terms, create risk or legal exposure for us or others, fail to pay, or if we are required to by law.
            Where reasonable we’ll warn you first and give you a chance to fix the problem.
          </li>
          <li>If we close your account for a serious or repeated breach, unused plans, passes and balances may be forfeited.</li>
          <li>If we stop offering the Service entirely, we’ll give at least 30 days’ notice and refund unused prepaid balances.</li>
          <li>Sections that by their nature should continue — including payments owed, disclaimers, limits of liability and indemnity — survive termination.</li>
        </ul>
      </LegalSection>

      <LegalSection id="disclaimers" title="12. Disclaimers">
        <p>
          The Service and all Output are provided <strong>“as is” and “as available”</strong>. To the fullest extent permitted by law we disclaim all warranties, express or implied,
          including merchantability, fitness for a particular purpose, accuracy and non-infringement. AI output can be wrong, incomplete or offensive — you must check it before relying
          on it.
        </p>
      </LegalSection>

      <LegalSection id="liability" title="13. Limitation of liability">
        <p>
          To the fullest extent permitted by law, we are not liable for any indirect, incidental, special, consequential or punitive damages, or for lost profits, revenue, data or
          goodwill. Our total liability for all claims relating to the Service is limited to the amount you paid us in the three months before the event that gave rise to the claim.
        </p>
        <p>Nothing in these Terms limits liability that cannot be limited by law, or your mandatory rights as a consumer.</p>
      </LegalSection>

      <LegalSection id="indemnity" title="14. Indemnity">
        <p>
          You agree to defend and indemnify {LEGAL.entity} against claims, losses and costs (including reasonable legal fees) arising from your Input, your use of Output, your products
          built on the Service, or your breach of these Terms or the law.
        </p>
      </LegalSection>

      <LegalSection id="changes" title="15. Changes">
        <p>
          We may update these Terms. We’ll change the date at the top, and for significant changes we’ll notify you by email or in your dashboard at least 14 days before they take
          effect. If you continue to use the Service after that, you accept the new Terms; if you don’t agree, you can delete your account.
        </p>
      </LegalSection>

      <LegalSection id="law" title="16. Governing law">
        <p>
          These Terms are governed by the laws of {LEGAL.country}. Disputes will be resolved by the competent courts of {LEGAL.country}, unless the law where you live gives you the right to
          bring a claim there. Before starting any formal dispute, please contact us so we can try to resolve it informally.
        </p>
      </LegalSection>

      <LegalSection id="contact" title="17. Contact">
        <p>
          {LEGAL.entity}, {LEGAL.country} — <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>
        </p>
      </LegalSection>
    </LegalPage>
  );
}
