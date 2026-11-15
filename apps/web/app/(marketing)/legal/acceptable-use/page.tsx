import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL } from "@/components/marketing/legal/config";
import { LegalPage, LegalSection, toc } from "@/components/marketing/legal/shell";

export const metadata: Metadata = {
  title: "Acceptable Use Policy",
  description: `What the ${LEGAL.brand} API, Playground and Image Studio may not be used for, and how we enforce it.`,
  alternates: { canonical: "/legal/acceptable-use" },
};

const TOC = toc([
  ["scope", "Scope"],
  ["harmful", "Harmful and illegal content"],
  ["people", "Harm to people and privacy"],
  ["deception", "Deception and fraud"],
  ["security", "Security and malicious code"],
  ["platform", "Misuse of the platform"],
  ["providers", "Model provider policies"],
  ["responsible", "Building responsibly"],
  ["enforcement", "Enforcement"],
  ["reporting", "Reporting abuse"],
]);

export default function AcceptableUsePage() {
  return (
    <LegalPage
      slug="acceptable-use"
      toc={TOC}
      intro={
        <p>
          This policy describes what you may not do with {LEGAL.brand}. It’s part of our <Link href="/legal/terms">Terms of Service</Link> and applies to everything you send through the
          Service and everything you build on it — including what your own users do with your product.
        </p>
      }
    >
      <LegalSection id="scope" title="1. Scope">
        <p>
          The rules apply to API requests, Playground chats, Image Studio prompts and uploads, and any output you generate, publish or distribute. If your application lets other people
          send prompts, you are responsible for making sure their use follows this policy too.
        </p>
      </LegalSection>

      <LegalSection id="harmful" title="2. Harmful and illegal content">
        <p>Don’t use the Service to create, request or distribute:</p>
        <ul>
          <li>
            <strong>Any sexual content involving minors.</strong> This is never allowed; we report it to the authorities.
          </li>
          <li>Content that breaks the law where you or your users are, or that facilitates illegal activity.</li>
          <li>Instructions or meaningful help for building chemical, biological, radiological, nuclear or explosive weapons, or for other mass-casualty attacks.</li>
          <li>Content that promotes, glorifies or recruits for terrorism or violent extremism.</li>
          <li>Content that encourages suicide, self-harm or eating disorders.</li>
          <li>Sexual content that is non-consensual, or intimate imagery of a real person without their consent.</li>
          <li>Content that infringes someone else’s copyright, trademark or other rights.</li>
        </ul>
      </LegalSection>

      <LegalSection id="people" title="3. Harm to people and privacy">
        <ul>
          <li>Harassment, threats, bullying or content that promotes hatred or violence against people based on protected characteristics.</li>
          <li>Doxxing, stalking or tracking people, or collecting and processing personal data without a lawful basis.</li>
          <li>Facial recognition or biometric identification of people without their consent, or covert surveillance.</li>
          <li>Images or audio that realistically depict a real person saying or doing something they didn’t, presented as genuine.</li>
          <li>Automated decisions with legal or similarly significant effects on people (for example credit, employment or housing) without meaningful human review.</li>
        </ul>
      </LegalSection>

      <LegalSection id="deception" title="4. Deception and fraud">
        <ul>
          <li>Scams, phishing, fake reviews, or impersonating people, companies or government bodies.</li>
          <li>Spam, including bulk unsolicited messages or SEO spam at scale.</li>
          <li>Misleading people into thinking they’re talking to a human when they’re talking to an AI, where that matters to them.</li>
          <li>Disinformation campaigns, or content designed to manipulate elections or civic processes.</li>
          <li>Academic dishonesty services or plagiarism sold as original work.</li>
        </ul>
      </LegalSection>

      <LegalSection id="security" title="5. Security and malicious code">
        <ul>
          <li>Writing, improving or deploying malware, ransomware, exploits or credential stealers for unauthorised use.</li>
          <li>Attacking, scanning or gaining unauthorised access to systems you don’t own or have permission to test.</li>
          <li>Probing, overloading or trying to break the security of {LEGAL.brand} or our providers.</li>
        </ul>
        <p>Authorised security research, defensive work and testing your own systems are fine.</p>
      </LegalSection>

      <LegalSection id="platform" title="6. Misuse of the platform">
        <ul>
          <li>Creating multiple accounts to collect extra free tokens or referral rewards, or using fake or disposable identities.</li>
          <li>Sharing, selling or publishing API keys, or running a public proxy that gives others direct access to our API.</li>
          <li>Getting around rate limits, quotas, model access rules or payment checks.</li>
          <li>Trying to extract model weights, system prompts or our providers’ credentials, or using output to build a competing model where the provider forbids it.</li>
          <li>Load testing or benchmarking at a scale that affects other users, without asking us first.</li>
          <li>Paying with stolen funds, or abusing the refund or payment-review process.</li>
        </ul>
      </LegalSection>

      <LegalSection id="providers" title="7. Model provider policies">
        <p>
          Each model is run by a third-party provider with its own usage policy. When you use a model, you must also follow that provider’s rules. Where they are stricter than this
          policy, theirs apply.
        </p>
      </LegalSection>

      <LegalSection id="responsible" title="8. Building responsibly">
        <ul>
          <li>Review AI output before it reaches people where accuracy matters — health, legal, financial or safety decisions.</li>
          <li>Tell your users when they are interacting with AI or seeing AI-generated content.</li>
          <li>Add your own moderation if your app accepts prompts from the public.</li>
        </ul>
      </LegalSection>

      <LegalSection id="enforcement" title="9. Enforcement">
        <p>
          We may review usage metadata and reports to enforce this policy. Depending on how serious it is, we may warn you, block specific requests or models, revoke keys, suspend or
          close your account (without refund for serious or repeated breaches), and report illegal activity to the authorities. If you think we got it wrong, reply to our message and
          we’ll take another look.
        </p>
      </LegalSection>

      <LegalSection id="reporting" title="10. Reporting abuse">
        <p>
          If you see the Service being misused, email <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a> with as much detail as you can. Please don’t include illegal material itself
          in your report.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
