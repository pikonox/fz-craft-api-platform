import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL } from "@/components/marketing/legal/config";
import { LegalPage, LegalSection, toc } from "@/components/marketing/legal/shell";

export const metadata: Metadata = {
  title: "Disclaimer",
  description: `Important limits on AI-generated output, third-party models and trademarks, pricing information and crypto payments on ${LEGAL.brand}.`,
  alternates: { canonical: "/legal/disclaimer" },
};

const TOC = toc([
  ["ai-output", "AI-generated output"],
  ["not-advice", "Not professional advice"],
  ["trademarks", "Third-party models and trademarks"],
  ["availability", "Availability and model behaviour"],
  ["pricing", "Prices and estimates"],
  ["crypto", "Crypto payments"],
  ["links", "External links"],
  ["accuracy", "Website content"],
]);

export default function DisclaimerPage() {
  return (
    <LegalPage
      slug="disclaimer"
      toc={TOC}
      intro={
        <p>
          This page sets out important limits on what {LEGAL.brand} and the AI models it gives access to can promise. It supplements our <Link href="/legal/terms">Terms of Service</Link>
          .
        </p>
      }
    >
      <LegalSection id="ai-output" title="1. AI-generated output">
        <p>
          Text, code and images produced by AI models are generated automatically and can be <strong>inaccurate, incomplete, out of date, biased or offensive</strong>, even when they
          sound confident. Code may contain bugs or security issues. Always review and test output before you rely on it, publish it or run it. You are responsible for how you use
          output and for checking that your use is lawful and doesn’t infringe anyone’s rights.
        </p>
      </LegalSection>

      <LegalSection id="not-advice" title="2. Not professional advice">
        <p>
          Nothing produced through {LEGAL.brand} — and nothing on this website — is medical, legal, financial, tax or other professional advice. For decisions in those areas, consult a
          qualified professional.
        </p>
      </LegalSection>

      <LegalSection id="trademarks" title="3. Third-party models and trademarks">
        <p>
          {LEGAL.brand} is an <strong>independent service</strong>. We are not affiliated with, endorsed by or sponsored by OpenAI, Anthropic, Google, DeepSeek, Alibaba (Qwen), Meta,
          xAI, Moonshot AI, Zhipu AI, ByteDance, Xiaomi or any other model developer. Model names, product names and logos are trademarks of their respective owners and are used only to
          identify which models are available through the Service.
        </p>
        <p>
          We access models through third-party providers. A model reached through {LEGAL.brand} may behave differently from the same model used directly with its developer — for example
          different default settings, context limits, safety filters, speed or availability.
        </p>
      </LegalSection>

      <LegalSection id="availability" title="4. Availability and model behaviour">
        <p>
          Models can be slow, change behaviour, be rate-limited by their provider, enter maintenance or be withdrawn without notice. The status shown on our website is updated
          automatically and may not reflect every issue. Context windows, capabilities and speeds listed in the catalog are based on information from providers and may vary.
        </p>
      </LegalSection>

      <LegalSection id="pricing" title="5. Prices and estimates">
        <p>
          The amount you pay is the plan, pass or per-image price shown at checkout. Figures such as “value at model price”, per-token prices in the catalog and results from the cost
          estimator are informational estimates to help you compare models and plan usage — they are not quotes or invoices. Actual token counts depend on the model’s tokenizer and your
          prompts.
        </p>
      </LegalSection>

      <LegalSection id="crypto" title="6. Crypto payments">
        <p>
          We accept USDT and Binance Pay only as a way to pay for the Service. {LEGAL.brand} is not an exchange, wallet, bank or investment service and doesn’t give financial advice.
          Blockchain transactions are irreversible, network fees are set by the network, and you are responsible for sending the right amount, on the right network, to the right address.
        </p>
      </LegalSection>

      <LegalSection id="links" title="7. External links">
        <p>
          Our website, documentation and AI output may link to third-party websites. We don’t control them and aren’t responsible for their content, products or privacy practices.
        </p>
      </LegalSection>

      <LegalSection id="accuracy" title="8. Website content">
        <p>
          We work to keep this website and our documentation accurate, but they may contain errors or become out of date. If you spot a mistake, please let us know at{" "}
          <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
