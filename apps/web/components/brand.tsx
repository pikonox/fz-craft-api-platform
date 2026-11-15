import Link from "next/link";
import { BRAND, cn } from "@/lib/utils";

/**
 * Brand artwork, cut from public/logo.png into public/brand/:
 * - logo-*.webp       FZ mark + "FZ-Craft" lettering (header, sidebars, cards)
 * - logo-full-*.webp  the same plus the "Access Top AI Models via API" tagline (footer)
 * - mark.webp         the FZ mark alone, for square icon slots (model tiles)
 * Each logo has a light-theme file (original colours) and a dark-theme file (lettering lightened).
 */
const LOGOS = {
  compact: { w: 607, h: 192, light: "/brand/logo-light.webp", dark: "/brand/logo-dark.webp" },
  full: { w: 879, h: 288, light: "/brand/logo-full-light.webp", dark: "/brand/logo-full-dark.webp" },
};

/** The full logo image. Size it by height (e.g. `h-10`); the width follows. */
export function BrandLogo({ full = false, className }: { full?: boolean; className?: string }) {
  const l = full ? LOGOS.full : LOGOS.compact;
  const common = { alt: BRAND, width: l.w, height: l.h, draggable: false } as const;
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={l.light} {...common} className={cn("h-10 w-auto shrink-0 select-none dark:hidden", className)} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={l.dark} {...common} className={cn("hidden h-10 w-auto shrink-0 select-none dark:block", className)} />
    </>
  );
}

/** The FZ mark alone (≈3:2). In a square box (e.g. `size-5`) it's centred with object-contain. */
export function LogoMark({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/mark.webp"
      alt=""
      aria-hidden
      width={381}
      height={256}
      draggable={false}
      className={cn("h-7 w-auto shrink-0 select-none object-contain dark:brightness-125", className)}
    />
  );
}

/** The logo as a home link. `full` adds the tagline. */
export function Logo({ href = "/", className, logoClassName, full, badge }: { href?: string; className?: string; logoClassName?: string; full?: boolean; badge?: React.ReactNode }) {
  return (
    <Link href={href} className={cn("flex shrink-0 items-center gap-2", className)}>
      <BrandLogo full={full} className={logoClassName} />
      {badge}
    </Link>
  );
}
