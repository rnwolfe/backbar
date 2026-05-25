/**
 * Console design tokens — mirrors the Backbar Console design handoff.
 *
 * The whole UI is built on a single dark surface palette with three accent
 * options (cyan/amber/green). Tokens are exported as plain hex strings so
 * components can use them in inline styles where Tailwind's utility classes
 * would otherwise force extra round-trips through the JIT pipeline.
 */
export const T = {
  bg: "#0a0c0f",
  surface: "#0f1318",
  surface2: "#141921",
  surface3: "#1a2029",
  hairline: "#1c232d",
  hairline2: "#262f3c",
  ink: "#dbe2ec",
  inkMuted: "#8794a6",
  inkDim: "#4a5566",
  inkVdim: "#2d3441",
  cyan: "#4ddae8",
  cyanDim: "#1d6b75",
  cyanGlow: "rgba(77,218,232,0.06)",
  amber: "#e9a648",
  amberDim: "#6b4a14",
  amberGlow: "rgba(233,166,72,0.06)",
  green: "#62c97d",
  greenDim: "#1f5a30",
  greenGlow: "rgba(98,201,125,0.06)",
  red: "#ec5a4d",
  redGlow: "rgba(236,90,77,0.06)",
  body: '"Geist", system-ui, sans-serif',
  mono: '"Geist Mono", ui-monospace, monospace',
} as const;

export type AccentName = "cyan" | "amber" | "green";

export interface AccentTuple {
  primary: string;
  dim: string;
  glow: string;
}

/** Resolve the active accent triple from the operator's chosen accent. */
export function accent(name: AccentName | undefined): AccentTuple {
  if (name === "amber") return { primary: T.amber, dim: T.amberDim, glow: T.amberGlow };
  if (name === "green") return { primary: T.green, dim: T.greenDim, glow: T.greenGlow };
  return { primary: T.cyan, dim: T.cyanDim, glow: T.cyanGlow };
}

export type Density = "compact" | "regular" | "comfy";

/**
 * Density multipliers for cell padding, stat font, row heights, page header
 * size. The numbers are deliberately spread far enough apart that switching
 * between them in the Tweaks panel produces an obvious visual change across
 * every screen.
 */
export const DENSITY_SCALE: Record<
  Density,
  {
    cellPad: string;
    statPad: string;
    statSize: number;
    rowPad: number;
    pageTitleSize: number;
    pageHeadGap: number;
  }
> = {
  compact: { cellPad: "8px 10px", statPad: "10px 12px", statSize: 22, rowPad: 4, pageTitleSize: 18, pageHeadGap: 8 },
  regular: { cellPad: "12px 14px", statPad: "16px 18px", statSize: 30, rowPad: 8, pageTitleSize: 22, pageHeadGap: 14 },
  comfy: { cellPad: "18px 20px", statPad: "22px 24px", statSize: 36, rowPad: 12, pageTitleSize: 28, pageHeadGap: 20 },
};
