import type { CSSProperties } from "react";

/**
 * Themes are pure presentation: a set of CSS custom properties applied to a
 * wrapper element. Adding a theme here makes it available everywhere else with
 * no other change.
 *
 * Kept to four on purpose. The picker lays them out as a fixed grid, so a fifth
 * would either shrink the tiles or bring back the sideways scroll that made the
 * section feel like an afterthought.
 */

export type Theme = {
  id: string;
  name: string;
  blurb: string;
  emoji: string;
  /** Small swatch trio used by the picker. */
  swatch: [string, string, string];
  vars: Record<string, string>;
};

export const THEMES: Theme[] = [
  {
    id: "blossom",
    name: "Blossom",
    blurb: "Rose, peach and soft gold",
    emoji: "\u{1F338}",
    swatch: ["#ff9ecd", "#ffc9e3", "#ffe3b0"],
    vars: {
      "--sky-1": "#2a0f2e",
      "--sky-2": "#5c1f4d",
      "--sky-3": "#9b3b6a",
      "--accent": "#ff9ecd",
      "--accent-2": "#ffd28f",
      "--accent-ink": "#3d0b28",
      "--card": "rgba(255, 233, 244, 0.10)",
      "--card-strong": "rgba(255, 233, 244, 0.17)",
      "--border": "rgba(255, 200, 228, 0.28)",
      "--ink": "#fff2f8",
      "--ink-soft": "rgba(255, 242, 248, 0.68)",
      "--glow": "rgba(255, 158, 205, 0.45)",
      "--star": "#ffd9ec",
    },
  },
  {
    id: "voyager",
    name: "Voyager",
    blurb: "Deep blue, cyan and starlight",
    emoji: "\u{1F680}",
    swatch: ["#5eb3ff", "#8ce0ff", "#b9c8ff"],
    vars: {
      "--sky-1": "#050c22",
      "--sky-2": "#0e2350",
      "--sky-3": "#1d4a8a",
      "--accent": "#5eb3ff",
      "--accent-2": "#8ce0ff",
      "--accent-ink": "#04162e",
      "--card": "rgba(210, 232, 255, 0.09)",
      "--card-strong": "rgba(210, 232, 255, 0.16)",
      "--border": "rgba(150, 200, 255, 0.26)",
      "--ink": "#eef6ff",
      "--ink-soft": "rgba(238, 246, 255, 0.66)",
      "--glow": "rgba(94, 179, 255, 0.42)",
      "--star": "#d6ecff",
    },
  },
  {
    id: "moonlit",
    name: "Moonlit",
    blurb: "Violet, silver and midnight",
    emoji: "\u{1F319}",
    swatch: ["#b79cff", "#d9c9ff", "#e9e3ff"],
    vars: {
      "--sky-1": "#100a26",
      "--sky-2": "#241a4d",
      "--sky-3": "#453382",
      "--accent": "#b79cff",
      "--accent-2": "#e4d4ff",
      "--accent-ink": "#150c2e",
      "--card": "rgba(226, 216, 255, 0.09)",
      "--card-strong": "rgba(226, 216, 255, 0.16)",
      "--border": "rgba(190, 172, 255, 0.26)",
      "--ink": "#f4f0ff",
      "--ink-soft": "rgba(244, 240, 255, 0.66)",
      "--glow": "rgba(183, 156, 255, 0.42)",
      "--star": "#ece4ff",
    },
  },
  {
    id: "thicket",
    name: "Thicket",
    blurb: "Forest green, moss and honey",
    emoji: "\u{1F343}",
    swatch: ["#6fd8a8", "#a8e6b8", "#f2d98a"],
    vars: {
      "--sky-1": "#04180f",
      "--sky-2": "#0d3524",
      "--sky-3": "#1b5c3c",
      "--accent": "#6fd8a8",
      "--accent-2": "#f2d98a",
      "--accent-ink": "#042014",
      "--card": "rgba(214, 255, 232, 0.09)",
      "--card-strong": "rgba(214, 255, 232, 0.16)",
      "--border": "rgba(140, 226, 180, 0.26)",
      "--ink": "#eefff5",
      "--ink-soft": "rgba(238, 255, 245, 0.66)",
      "--glow": "rgba(111, 216, 168, 0.4)",
      "--star": "#d9ffe9",
    },
  },
];

/** Referenced by id so reordering or retiring a theme cannot silently move it. */
export const DEFAULT_THEME =
  THEMES.find((t) => t.id === "moonlit") ?? THEMES[0];

export function themeById(id: string | undefined): Theme {
  return THEMES.find((t) => t.id === id) ?? DEFAULT_THEME;
}

/** Turns a theme into a `style` object React can apply directly. */
export function themeStyle(theme: Theme): CSSProperties {
  return theme.vars as CSSProperties;
}
