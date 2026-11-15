import { LogoMark } from "@/components/brand";
import { BRAND, cn } from "@/lib/utils";

/**
 * Real provider logos (from @lobehub/icons-static-svg, MIT) served from /public/logos.
 * "mono" logos are single-colour (fill=currentColor) and are drawn with a CSS mask so they
 * follow the text colour in light and dark mode; the rest are full-colour images.
 */
type Logo = { file: string; mono?: boolean };

const c = (file: string): Logo => ({ file });
const m = (file: string): Logo => ({ file, mono: true });

/** Keys are vendor names lower-cased with everything but a–z / 0–9 removed. */
const LOGOS: Record<string, Logo> = {
  deepseek: c("deepseek-color"),
  qwen: c("qwen-color"),
  alibaba: c("alibaba-color"),
  alibabacloud: c("alibaba-color"),
  meta: c("meta-color"),
  metaai: c("meta-color"),
  llama: c("meta-color"),
  openai: m("openai"),
  anthropic: m("anthropic"),
  claude: c("claude-color"),
  google: c("google-color"),
  googledeepmind: c("gemini-color"),
  gemini: c("gemini-color"),
  gemma: c("gemma-color"),
  mistral: c("mistral-color"),
  mistralai: c("mistral-color"),
  xai: m("xai"),
  grok: m("grok"),
  moonshot: m("moonshot"),
  moonshotai: m("moonshot"),
  // Kimi's colour logo is a dark glyph that disappears in dark mode; use Moonshot's single-colour mark
  kimi: m("moonshot"),
  zhipu: c("zhipu-color"),
  zhipuai: c("zhipu-color"),
  glm: c("zhipu-color"),
  chatglm: c("zhipu-color"),
  zai: m("zai"),
  minimax: c("minimax-color"),
  cohere: c("cohere-color"),
  perplexity: c("perplexity-color"),
  nvidia: c("nvidia-color"),
  blackforestlabs: m("bfl"),
  bfl: m("bfl"),
  flux: m("flux"),
  stability: c("stability-color"),
  stabilityai: c("stability-color"),
  bytedance: c("bytedance-color"),
  doubao: c("doubao-color"),
  tencent: c("hunyuan-color"),
  hunyuan: c("hunyuan-color"),
  baidu: c("baidu-color"),
  ernie: c("baidu-color"),
  microsoft: c("microsoft-color"),
  phi: c("microsoft-color"),
  "01ai": c("yi-color"),
  yi: c("yi-color"),
  ideogram: m("ideogram"),
  midjourney: m("midjourney"),
  recraft: m("recraft"),
  xiaomi: m("xiaomimimo"),
  mimo: m("xiaomimimo"),
  muse: c("meta-color"),
  // Developer tools (used on the website)
  cursor: m("cursor"),
  claudecode: c("claudecode-color"),
  cline: m("cline"),
  roocode: m("roocode"),
  kilocode: m("kilocode"),
  opencode: m("opencode"),
  langchain: c("langchain-color"),
  openaisdk: m("openai"),
};

/** Model-id prefixes used when the vendor name isn't recognised, e.g. "gpt-4o" → OpenAI. */
const MODEL_HINTS: [RegExp, Logo][] = [
  [/^(gpt|o\d|dall-?e|chatgpt)/, LOGOS.openai],
  [/^(claude|anthropic)/, LOGOS.claude],
  [/^gemini/, LOGOS.gemini],
  [/^gemma/, LOGOS.gemma],
  [/^(llama|meta-)/, LOGOS.meta],
  [/^deepseek/, LOGOS.deepseek],
  [/^(qwen|qwq)/, LOGOS.qwen],
  [/^(mistral|mixtral|codestral|ministral|magistral|pixtral)/, LOGOS.mistral],
  [/^grok/, LOGOS.grok],
  [/^(kimi|moonshot)/, LOGOS.kimi],
  [/^(glm|chatglm)/, LOGOS.zhipu],
  [/^minimax/, LOGOS.minimax],
  [/^(command|cohere)/, LOGOS.cohere],
  [/^(sonar|pplx)/, LOGOS.perplexity],
  [/^flux/, LOGOS.flux],
  [/^(sd|stable-diffusion)/, LOGOS.stability],
  [/^doubao/, LOGOS.doubao],
  [/^seed-/, LOGOS.bytedance],
  [/^mimo/, LOGOS.xiaomi],
  [/^muse-/, LOGOS.muse],
  [/^hunyuan/, LOGOS.hunyuan],
  [/^ernie/, LOGOS.baidu],
  [/^phi-/, LOGOS.phi],
  [/^yi-/, LOGOS.yi],
  [/^ideogram/, LOGOS.ideogram],
  [/^recraft/, LOGOS.recraft],
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function isOwnBrand(vendor?: string | null) {
  return Boolean(vendor) && norm(vendor!) === norm(BRAND);
}

/** Finds a logo by model family first (claude-* → Claude, gemini-* → Gemini), then by vendor name. */
export function findVendorLogo(vendor?: string | null, modelId?: string | null): Logo | null {
  const id = (modelId ?? "").toLowerCase().split("/").pop() ?? "";
  const byModel = id ? MODEL_HINTS.find(([rx]) => rx.test(id))?.[1] : undefined;
  return byModel ?? (vendor ? LOGOS[norm(vendor)] : undefined) ?? null;
}

/** True when VendorLogo will draw something for this vendor/model. */
export function hasVendorLogo(vendor?: string | null, modelId?: string | null) {
  return isOwnBrand(vendor) || Boolean(findVendorLogo(vendor, modelId));
}

/** The bare logo glyph (no tile). Size it with className, e.g. "size-5". Renders nothing if unknown. */
export function VendorLogo({ vendor, modelId, className }: { vendor?: string | null; modelId?: string | null; className?: string }) {
  if (isOwnBrand(vendor)) return <LogoMark className={cn("size-5", className)} />;
  const logo = findVendorLogo(vendor, modelId);
  if (!logo) return null;
  const src = `/logos/${logo.file}.svg`;
  if (logo.mono) {
    const mask = `url(${src}) center / contain no-repeat`;
    return <span aria-hidden className={cn("inline-block size-5 shrink-0 bg-current", className)} style={{ mask, WebkitMask: mask }} />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" aria-hidden draggable={false} className={cn("size-5 shrink-0 select-none", className)} />;
}
