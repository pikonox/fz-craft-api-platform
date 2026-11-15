import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL } from "@/components/marketing/legal/config";
import { InShort, LegalPage, LegalSection, LegalTable, toc } from "@/components/marketing/legal/shell";

export const metadata: Metadata = {
  title: "Refund Policy",
  description: `When ${LEGAL.brand} plans, passes, wallet top-ups and image credits can be refunded, and how to request one.`,
  alternates: { canonical: "/legal/refunds" },
};

const TOC = toc([
  ["first-plan", "First-plan guarantee"],
  ["at-a-glance", "At a glance"],
  ["upgrades", "Upgrades and changes"],
  ["wallets", "Balance and image wallet"],
  ["payment-problems", "Payment problems"],
  ["our-fault", "When something goes wrong on our side"],
  ["how-to-ask", "How to request a refund"],
]);

export default function RefundsPage() {
  return (
    <LegalPage
      slug="refunds"
      toc={TOC}
      intro={
        <>
          <p>We want you to be happy with {LEGAL.brand}. This policy explains exactly when money can be returned, so there are no surprises.</p>
          <InShort>
            <ul>
              <li>Your first paid monthly plan can be refunded to your balance within {LEGAL.refundHours} hours — one click in Billing.</li>
              <li>Failed images are never charged, so they never need refunding.</li>
              <li>Other plans, passes and top-ups are final once active, but we always fix mistakes that are ours.</li>
              <li>Crypto payments can’t be reversed, so please send the exact amount on the right network.</li>
            </ul>
          </InShort>
        </>
      }
    >
      <LegalSection id="first-plan" title="1. First-plan guarantee">
        <p>
          The first time you buy a paid <strong>monthly plan</strong>, you can cancel it within <strong>{LEGAL.refundHours} hours</strong> of purchase and get the full price back as
          account balance. Use <strong>Billing → Plans → Refund</strong> in your dashboard; it’s instant. Your account moves back to the Free plan.
        </p>
        <p>This applies once per account, to your first paid monthly plan only. The refund goes to your account balance, which you can use for another plan, pass or top-up.</p>
      </LegalSection>

      <LegalSection id="at-a-glance" title="2. At a glance">
        <LegalTable
          head={["Purchase", "Refundable?"]}
          rows={[
            ["First paid monthly plan", `Yes — in full, to your balance, within ${LEGAL.refundHours} hours`],
            ["Later monthly plans and renewals", "No, once the billing period has started. You can turn off auto-renew at any time to stop the next charge."],
            ["24-hour passes", "No — passes start immediately"],
            ["Unused tokens at the end of a period", "No — tokens don’t carry over"],
            ["Image generations that fail", "Never charged — the held amount is returned automatically"],
            ["Account balance / image wallet top-ups", "Not withdrawable as cash — see below"],
            ["Bonus and referral tokens", "No cash value"],
          ]}
        />
      </LegalSection>

      <LegalSection id="upgrades" title="3. Upgrades and changes">
        <p>
          When you switch to a different monthly plan, the change happens immediately. The unused part of your current paid plan — whichever is smaller of the time left and the
          tokens left — is credited to your account balance automatically and can go toward the new plan. Turning off auto-renew stops future charges but doesn’t refund the current
          period.
        </p>
      </LegalSection>

      <LegalSection id="wallets" title="4. Balance and image wallet">
        <p>
          Your account balance and image wallet are prepaid credit for use on {LEGAL.brand}. They can’t be withdrawn, exchanged for cash or moved to another account. Before you top up,
          please make sure you plan to use the credit.
        </p>
        <p>
          If you’ve topped up by mistake and haven’t used any of that credit, contact us within <strong>7 days</strong> — we’ll review it case by case and, where we can, return it to
          the original payment method minus any network or transfer fees.
        </p>
      </LegalSection>

      <LegalSection id="payment-problems" title="5. Payment problems">
        <ul>
          <li>
            <strong>Paid twice or paid too much</strong> — contact us within 7 days with both references. We’ll credit the extra amount to your balance, or return it where possible.
          </li>
          <li>
            <strong>Paid after an order expired</strong> — orders expire after {LEGAL.autoOrderHours} hours (crypto) or {LEGAL.manualOrderHours} hours (PKR methods). Send us the
            transaction hash or reference and we’ll credit it once we confirm it arrived.
          </li>
          <li>
            <strong>Wrong network, token, address or amount</strong> — blockchain transactions can’t be reversed. If the funds reached an address we control, we’ll do our best to credit
            them; if they went elsewhere, we can’t recover them.
          </li>
          <li>
            <strong>Manual payment rejected</strong> — if we can’t confirm a JazzCash, Easypaisa or bank transfer, we’ll tell you why. Reply with clearer proof and we’ll review it again.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="our-fault" title="6. When something goes wrong on our side">
        <p>
          If you were charged for something we didn’t deliver — for example a sustained outage on your paid plan, a billing error or a duplicate charge — tell us and we’ll make it right
          with balance credit, extra time on your plan or a refund, depending on the situation. If we ever close the Service permanently, we’ll refund unused prepaid balances.
        </p>
        <p>
          Accounts closed for breaking the <Link href="/legal/terms">Terms</Link> or <Link href="/legal/acceptable-use">Acceptable Use Policy</Link> aren’t eligible for refunds.
        </p>
      </LegalSection>

      <LegalSection id="how-to-ask" title="7. How to request a refund">
        <ol>
          <li>For the first-plan guarantee, use the Refund button in Billing — no need to contact us.</li>
          <li>
            For anything else, open a ticket from <strong>Support</strong> in your dashboard (choose “Billing”) or email <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a> with your
            account email and the payment ID or transaction reference.
          </li>
          <li>We reply within 2 business days. Balance credits are instant once approved; returns to a wallet or bank account usually take 3–7 business days.</li>
        </ol>
      </LegalSection>
    </LegalPage>
  );
}
