"use client";

import * as React from "react";

/** True while the element is on screen (used to pause animations off-screen). */
export function useInView(ref: React.RefObject<Element | null>, rootMargin = "-60px 0px") {
  const [inView, setInView] = React.useState(false);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, rootMargin]);
  return inView;
}

/** A counter that goes up every `ms` while active. */
export function useTicker(active: boolean, ms: number) {
  const [n, setN] = React.useState(0);
  React.useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setN((x) => x + 1), ms);
    return () => window.clearInterval(id);
  }, [active, ms]);
  return n;
}

/** Types `text` out when `run` turns on or the text changes; shows it complete otherwise. */
export function useTypewriter(text: string, run: boolean, speed = 34) {
  const [n, setN] = React.useState(text.length);
  React.useEffect(() => {
    if (!run) {
      setN(text.length);
      return;
    }
    setN(0);
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setN(i);
      if (i >= text.length) window.clearInterval(id);
    }, speed);
    return () => window.clearInterval(id);
  }, [text, run, speed]);
  return { text: text.slice(0, n), done: n >= text.length };
}

/**
 * Runs `steps` (delays in ms from the start of a cycle) in a loop of `cycle` ms.
 * Returns the current step and how many cycles have started, from a single clock so they never drift.
 */
export function useTimeline(active: boolean, steps: number[], cycle: number) {
  const last = steps.length - 1;
  const [state, setState] = React.useState({ step: last, cycles: 0 });
  const key = steps.join(",");
  React.useEffect(() => {
    if (!active) {
      setState((s) => ({ ...s, step: last }));
      return;
    }
    const timers: number[] = [];
    const run = () => {
      timers.splice(0); // the previous cycle's timers have all fired by now
      steps.forEach((at, i) => timers.push(window.setTimeout(() => setState((s) => ({ step: i, cycles: i === 0 ? s.cycles + 1 : s.cycles })), at)));
      timers.push(window.setTimeout(run, cycle));
    };
    run();
    return () => timers.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, key, cycle, last]);
  return state;
}

/** Reveals `text` left to right out of random characters while `run` is on (a "decoding" effect). */
export function useScramble(text: string, run: boolean, duration = 1200) {
  const [out, setOut] = React.useState(text);
  React.useEffect(() => {
    if (!run) {
      setOut(text);
      return;
    }
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    const start = performance.now();
    const id = window.setInterval(() => {
      const p = Math.min(1, (performance.now() - start) / duration);
      const settled = Math.floor(p * text.length);
      setOut(
        [...text]
          .map((c, i) => (i < settled || c === "_" || c === "…" ? c : chars[Math.floor(Math.random() * chars.length)]))
          .join(""),
      );
      if (p >= 1) window.clearInterval(id);
    }, 45);
    return () => window.clearInterval(id);
  }, [text, run, duration]);
  return out;
}

/** True when the visitor asked their system to reduce motion. */
export function useReducedMotion() {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}
