import { useSyncExternalStore } from "react";

export type DisplayTheme = "light" | "dark" | "system" | "high-contrast";

const storageKey = "soma.display-theme";
const choices: DisplayTheme[] = ["light", "dark", "system", "high-contrast"];
const listeners = new Set<() => void>();
const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

function readTheme(): DisplayTheme {
  try {
    const saved = window.localStorage.getItem(storageKey);
    return choices.find((choice) => choice === saved) ?? "light";
  } catch {
    return "light";
  }
}

let preference = readTheme();

function applyTheme() {
  const dark = preference === "dark" || (preference === "system" && systemDark.matches);
  document.documentElement.dataset.theme = preference;
  document.documentElement.dataset.colorMode = dark ? "dark" : "light";
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#101827" : "#0b3a78");
  listeners.forEach((listener) => listener());
}

systemDark.addEventListener("change", applyTheme);
window.addEventListener("storage", (event) => {
  if (event.key !== storageKey) return;
  preference = readTheme();
  applyTheme();
});

export function setDisplayTheme(next: DisplayTheme) {
  preference = next;
  try { window.localStorage.setItem(storageKey, next); } catch { /* Current tab still uses the choice. */ }
  applyTheme();
}

export function useDisplayTheme() {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, () => preference);
}
