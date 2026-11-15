"use client";

import { create } from "zustand";

export type CheckoutIntent =
  | { purpose: "balance"; amountUsd?: number }
  | { purpose: "image_wallet"; amountUsd?: number }
  | { purpose: "plan"; planId: string; cycle: "monthly" | "yearly" | "daily" };

type CheckoutState = {
  open: boolean;
  intent: CheckoutIntent | null;
  start: (intent: CheckoutIntent) => void;
  close: () => void;
};

/** Global checkout dialog (mounted once in the dashboard shell). */
export const useCheckout = create<CheckoutState>((set) => ({
  open: false,
  intent: null,
  start: (intent) => set({ open: true, intent }),
  close: () => set({ open: false }),
}));

type UiState = {
  commandOpen: boolean;
  setCommandOpen: (v: boolean) => void;
  mobileNav: boolean;
  setMobileNav: (v: boolean) => void;
  /** Dashboard sidebar shrunk to an icon rail (remembered in this browser). */
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;
};

const SIDEBAR_KEY = "fz.sidebarCollapsed";

export const useUi = create<UiState>((set) => ({
  commandOpen: false,
  setCommandOpen: (v) => set({ commandOpen: v }),
  mobileNav: false,
  setMobileNav: (v) => set({ mobileNav: v }),
  sidebarCollapsed: false,
  setSidebarCollapsed: (v) => {
    set({ sidebarCollapsed: v });
    try {
      localStorage.setItem(SIDEBAR_KEY, v ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  },
}));

/** Applies the saved sidebar state (call once on the client). */
export function restoreSidebar() {
  try {
    if (localStorage.getItem(SIDEBAR_KEY) === "1") useUi.setState({ sidebarCollapsed: true });
  } catch {
    /* storage unavailable */
  }
}
