"use client";

import { useEffect, useState } from "react";

/** true after the first client render — use for values that differ between server and browser. */
export function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}

export function useOrigin() {
  const [o, setO] = useState("");
  useEffect(() => setO(window.location.origin), []);
  return o;
}

/** Live media-query match (false during SSR). */
export function useMediaQuery(query: string) {
  const [match, setMatch] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return match;
}
