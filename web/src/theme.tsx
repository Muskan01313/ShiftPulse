import { useState } from "react";

/** The three dark palettes. The choice is kept in this browser only. */
export const THEMES = [
  { id: "plum", name: "Plum & Peach", bg: "#210440", a: "#fdb095", b: "#e5958e" },
  { id: "lotus", name: "Lotus", bg: "#0a3323", a: "#e7b3aa", b: "#d3968c" },
  { id: "gold", name: "Midnight & Gold", bg: "#0b1020", a: "#f6c868", b: "#e09a2a" },
] as const;
export type ThemeId = (typeof THEMES)[number]["id"];

const KEY = "shiftpulse-theme";

function stored(): ThemeId {
  try {
    const v = localStorage.getItem(KEY);
    if (THEMES.some((t) => t.id === v)) return v as ThemeId;
  } catch {
    /* storage blocked: use the default */
  }
  return "plum";
}

const logoPath =
  '<rect x="27" y="7" width="10" height="6" rx="2" fill="INK"/><rect x="44" y="14" width="7" height="5" rx="2" fill="INK" transform="rotate(45 47.5 16.5)"/><circle cx="32" cy="36" r="17" fill="none" stroke="INK" stroke-width="5"/><path d="M24 36l6 6 11-12" fill="none" stroke="INK" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>';

/** Sets the palette on the page, and the browser tab's icon and colour to match. */
export function applyTheme(id: ThemeId) {
  const t = THEMES.find((x) => x.id === id)!;
  document.documentElement.dataset.theme = id;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t.bg);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.a}"/><stop offset="1" stop-color="${t.b}"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="url(#g)"/>${logoPath.replace(/INK/g, t.bg)}</svg>`;
  document.querySelector('link[rel="icon"]')?.setAttribute("href", `data:image/svg+xml,${encodeURIComponent(svg)}`);
}

export function initTheme() {
  applyTheme(stored());
}

/** The stopwatch-with-tick logo, drawn in the current palette. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="logo">
      <defs>
        <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: "var(--gold-a)" }} />
          <stop offset="1" style={{ stopColor: "var(--gold-b)" }} />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#logo-g)" />
      <g style={{ fill: "var(--accent-fg)", stroke: "var(--accent-fg)" }}>
        <rect x="27" y="7" width="10" height="6" rx="2" stroke="none" />
        <rect x="44" y="14" width="7" height="5" rx="2" stroke="none" transform="rotate(45 47.5 16.5)" />
        <circle cx="32" cy="36" r="17" fill="none" strokeWidth="5" />
        <path d="M24 36l6 6 11-12" fill="none" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

/** Three swatches to switch the palette. */
export function ThemePicker() {
  const [current, setCurrent] = useState<ThemeId>(stored);
  function pick(id: ThemeId) {
    setCurrent(id);
    applyTheme(id);
    try {
      localStorage.setItem(KEY, id);
    } catch {
      /* not saved: the choice lasts until reload */
    }
  }
  return (
    <div className="themes" role="group" aria-label="Colour theme">
      {THEMES.map((t) => (
        <button key={t.id} type="button" data-t={t.id} title={t.name} aria-label={t.name} aria-pressed={current === t.id} onClick={() => pick(t.id)} />
      ))}
    </div>
  );
}
