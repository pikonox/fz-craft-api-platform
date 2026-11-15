import { Ban, Box, Camera, Castle, Clapperboard, Grid3x3, Package, Palette, Shapes, Sparkles, Zap, type LucideIcon } from "lucide-react";

export type Quality = "1K" | "2K" | "4K";
export type StudioTab = "history" | "gallery" | "favorites";

export type StudioModel = {
  id: string;
  name: string;
  vendor: string;
  description?: string;
  pricing?: Partial<Record<Quality, number>>;
  capabilities?: string[];
};

export type StudioSummary = {
  imageBalance: number;
  models: StudioModel[];
  defaultModel: string | null;
  styles: { id: string; label: string }[];
  aspects: string[];
  qualities: Quality[];
  stats: { generations: number; images: number; spentMicros: number; favorites: number };
};

export type GenImage = { key: string; url: string; width: number; height: number; mime: string };

export type Generation = {
  id: string;
  model: string;
  prompt: string;
  style: string;
  aspect: string;
  quality: Quality;
  width: number;
  height: number;
  n: number;
  images: GenImage[];
  refImage: { url: string } | null;
  priceMicros: number;
  costMicros: number;
  status: "pending" | "succeeded" | "partial" | "failed";
  error?: string;
  favorite: boolean;
  latencyMs?: number;
  source?: string;
  createdAt: string;
  expiresAt: string | null;
};

export type GenerationsPage = { generations: Generation[]; total: number; page: number; limit: number };

/** What the create panel is set to. */
export type Draft = { prompt: string; model: string; style: string; aspect: string; quality: Quality; n: number };

/** One image in the lightbox, with the generation it came from. */
export type ViewerItem = { gen: Generation; img: GenImage; index: number };

/** The summary lives under "billing" so top-ups and plan changes refresh the image balance too. */
export const SUMMARY_KEY = ["billing", "studio-summary"] as const;
export const generationsKey = (tab: StudioTab) => ["studio", "generations", tab] as const;

/** Swatch shown on each style tile (drawn with CSS, no images). `dark` = light background, dark icon. */
export const STYLE_LOOK: Record<string, { icon: LucideIcon; bg: string; dark?: boolean }> = {
  none: { icon: Ban, bg: "" },
  photoreal: { icon: Camera, bg: "linear-gradient(160deg,#fde68a,#fb923c 50%,#0ea5e9)" },
  cinematic: { icon: Clapperboard, bg: "linear-gradient(160deg,#0f172a,#115e59 55%,#f97316)" },
  anime: { icon: Sparkles, bg: "linear-gradient(135deg,#f9a8d4,#e879f9 45%,#7dd3fc)" },
  "3d": { icon: Box, bg: "radial-gradient(circle at 35% 30%,#c4b5fd,#6366f1 45%,#1e1b4b)" },
  neon: { icon: Zap, bg: "linear-gradient(135deg,#c026d3,#4c1d95 50%,#22d3ee)" },
  fantasy: { icon: Castle, bg: "linear-gradient(160deg,#064e3b,#0d9488 50%,#fcd34d)" },
  watercolor: {
    icon: Palette,
    dark: true,
    bg: "radial-gradient(circle at 28% 30%,#fda4af 0,transparent 46%),radial-gradient(circle at 72% 58%,#93c5fd 0,transparent 50%),radial-gradient(circle at 40% 84%,#fde68a 0,transparent 46%),#fffbeb",
  },
  product: { icon: Package, dark: true, bg: "radial-gradient(circle at 50% 32%,#ffffff,#d4d4d8 62%,#a1a1aa)" },
  logo: { icon: Shapes, dark: true, bg: "linear-gradient(135deg,#f8fafc,#e2e8f0)" },
  pixel: { icon: Grid3x3, bg: "repeating-conic-gradient(#f472b6 0 25%,#8b5cf6 0 50%) 0 0/12px 12px" },
};

/** Starter ideas shown while there are no images yet. Each one sets a style and shape too. */
export const IDEAS: { prompt: string; style: string; aspect: string }[] = [
  { prompt: "A lighthouse on a cliff at golden hour, waves crashing below, warm mist", style: "photoreal", aspect: "3:2" },
  { prompt: "Rain-soaked night street in a futuristic city, glowing signs reflected in puddles", style: "cinematic", aspect: "16:9" },
  { prompt: "A girl reading under a giant cherry blossom tree, petals drifting in the wind", style: "anime", aspect: "2:3" },
  { prompt: "Isometric tiny coffee shop with plants and warm lights, soft pastel colors", style: "3d", aspect: "1:1" },
  { prompt: "Floating castle above the clouds at sunrise, waterfalls pouring off the edges", style: "fantasy", aspect: "3:2" },
  { prompt: "A fox made of simple geometric shapes, orange and white", style: "logo", aspect: "1:1" },
];

/** Price of one image for the chosen model + quality (micros). */
export function unitPrice(summary: StudioSummary | undefined, draft: Pick<Draft, "model" | "quality">) {
  return summary?.models.find((m) => m.id === draft.model)?.pricing?.[draft.quality] ?? 0;
}

export function ratio(aspect: string) {
  const [w, h] = aspect.split(":").map(Number);
  return w > 0 && h > 0 ? { w, h } : { w: 1, h: 1 };
}

/** "Deletes in 31h" style label for the automatic clean-up. */
export function expiryLabel(expiresAt: string | null, now = Date.now()) {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - now;
  if (ms <= 5 * 60_000) return { text: "Deleting soon", urgent: true };
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return { text: `Deletes in ${Math.max(1, Math.round(ms / 60_000))}m`, urgent: true };
  return { text: `Deletes in ${hours}h`, urgent: hours < 6 };
}

const extFor = (mime: string) => (mime === "image/svg+xml" ? "svg" : (mime.split("/")[1] ?? "png").replace("jpeg", "jpg"));

export function fileNameFor(g: Generation, img: GenImage, index: number) {
  const slug = g.prompt.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "image";
  return `${slug}-${index + 1}.${extFor(img.mime)}`;
}

/** Saves the image as a file. Falls back to opening it in a new tab if the host blocks cross-origin reads. */
export async function downloadImage(url: string, name: string) {
  try {
    const res = await fetch(url, { mode: "cors", credentials: url.startsWith("/") ? "include" : "omit" });
    if (!res.ok) throw new Error(String(res.status));
    const href = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement("a"), { href, download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 2000);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
