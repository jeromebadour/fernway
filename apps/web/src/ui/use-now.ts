"use client";
// The current time for a ticking display, shared by every component that needs it. null on the server and in the first
// render, so the server's clock never shows and hydration matches.
import { useSyncExternalStore } from "react";

let now = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(fn: () => void) {
  listeners.add(fn);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => { now = Date.now(); listeners.forEach((l) => l()); }, 1_000);
  }
  return () => {
    listeners.delete(fn);
    if (!listeners.size && timer) { clearInterval(timer); timer = null; }
  };
}

export function useNow(): number | null {
  return useSyncExternalStore(subscribe, () => (now === 0 ? null : now), () => null);
}
