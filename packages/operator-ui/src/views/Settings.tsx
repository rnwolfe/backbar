/**
 * Settings — admin actions (reset bar / reset recipes / reseed) plus visual
 * preferences. Visual tweaks live in the floating panel too — they sync.
 */
import { useState } from "react";
import {
  api,
  type AdminResetBarResponse,
  type AdminResetRecipesResponse,
  type AdminReseedResponse,
} from "../api/client";
import { Cell, Pill, SectionHead } from "../console/Cells";
import { PageHead } from "../console/Chrome";
import { T, accent } from "../console/tokens";
import { store, useStore } from "../store/useStore";
import { SettingsCategories } from "./SettingsCategories";
import { SettingsFlags } from "./SettingsFlags";
import { useViewport } from "../util/useViewport";

type Pending = "reset-bar" | "reset-recipes" | "reseed" | null;

interface ActionRow {
  key: "reset-bar" | "reset-recipes" | "reseed";
  title: string;
  blurb: string;
  cta: string;
  destructive: boolean;
  confirmPrompt: string;
}

const ACTIONS: ActionRow[] = [
  {
    key: "reset-bar",
    title: "Reset bar",
    blurb:
      "Delete every product and bottle. Recipes and historical pours stay. Sensor channels keep their device mapping but lose their bottle binding.",
    cta: "Wipe products + bottles",
    destructive: true,
    confirmPrompt: "Delete every product and bottle? Recipes will be kept. This cannot be undone.",
  },
  {
    key: "reset-recipes",
    title: "Reset recipes",
    blurb:
      "Delete every recipe. The bar (products + bottles) stays. Historical pours keep their bindings; only their recipe link goes null.",
    cta: "Wipe recipes",
    destructive: true,
    confirmPrompt: "Delete every recipe? The bar will be kept. This cannot be undone.",
  },
  {
    key: "reseed",
    title: "Reseed starter bar",
    blurb:
      "Idempotently insert the layer-1 starter products, bottles, and canon recipes. Safe to run on a populated DB — nothing already present is overwritten.",
    cta: "Run seed",
    destructive: false,
    confirmPrompt: "",
  },
];

export function Settings() {
  const tweaks = useStore((s) => s.tweaks);
  const products = useStore((s) => s.products.length);
  const bottles = useStore((s) => s.bottles.length);
  const recipes = useStore((s) => s.recipes.length);
  const [pending, setPending] = useState<Pending>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { isMobile } = useViewport();
  const A = accent(tweaks.accent).primary;

  async function run(action: ActionRow) {
    if (action.confirmPrompt && !window.confirm(action.confirmPrompt)) return;
    setPending(action.key);
    setError(null);
    setLastResult(null);
    try {
      const result =
        action.key === "reset-bar"
          ? formatReset(await api.adminResetBar())
          : action.key === "reset-recipes"
            ? formatResetRecipes(await api.adminResetRecipes())
            : formatReseed(await api.adminReseed());
      setLastResult(result);
      await store.hydrate();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(null);
    }
  }

  return (
    <div
      style={{
        padding: "14px 16px",
        overflow: "auto",
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      <PageHead
        title="Settings"
        meta={`${products} products · ${bottles} bottles · ${recipes} recipes`}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          gap: 12,
          padding: "0 16px",
          paddingBottom: 24,
        }}
      >
        <Cell title="ADMIN ACTIONS">
          <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 4 }}>
            {ACTIONS.map((a) => (
              <div
                key={a.key}
                style={{
                  padding: "12px 14px",
                  background: T.surface2,
                  border: `1px solid ${T.hairline}`,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                  <div style={{ fontSize: 14, color: T.ink, fontWeight: 500 }}>{a.title}</div>
                  <Pill
                    color={a.destructive ? T.red : A}
                    active
                    disabled={pending !== null}
                    onClick={() => void run(a)}
                  >
                    {pending === a.key ? "WORKING…" : a.cta.toUpperCase()}
                  </Pill>
                </div>
                <div style={{ fontSize: 11, color: T.inkMuted, lineHeight: 1.5 }}>{a.blurb}</div>
              </div>
            ))}

            {lastResult ? (
              <div
                style={{
                  padding: "10px 12px",
                  background: T.greenGlow,
                  border: `1px solid ${T.green}`,
                  color: T.green,
                  fontFamily: T.mono,
                  fontSize: 11,
                  whiteSpace: "pre-wrap",
                }}
              >
                {lastResult}
              </div>
            ) : null}
            {error ? (
              <div
                style={{
                  padding: "10px 12px",
                  background: T.redGlow,
                  border: `1px solid ${T.red}`,
                  color: T.red,
                  fontFamily: T.mono,
                  fontSize: 11,
                  whiteSpace: "pre-wrap",
                }}
              >
                {error}
              </div>
            ) : null}
          </div>
        </Cell>

        <Cell title="APPEARANCE" right="synced with TWEAKS panel">
          <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingTop: 4 }}>
            <SettingRadio
              label="Accent color"
              value={tweaks.accent}
              options={["cyan", "amber", "green"] as const}
              onChange={(v) => store.setTweak("accent", v)}
            />
            <SettingRadio
              label="Default bottle view"
              value={tweaks.defaultBottleView}
              options={["grid", "ribbon", "list"] as const}
              onChange={(v) => store.setTweak("defaultBottleView", v)}
            />
            <SettingRadio
              label="Density"
              value={tweaks.density}
              options={["compact", "regular", "comfy"] as const}
              onChange={(v) => store.setTweak("density", v)}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 11, color: T.inkMuted, letterSpacing: "0.08em", flex: 1 }}>
                Show fleet ticker in topbar
              </span>
              <Pill
                color={A}
                active={tweaks.showFleetTickerInTopBar}
                onClick={() => store.setTweak("showFleetTickerInTopBar", !tweaks.showFleetTickerInTopBar)}
              >
                {tweaks.showFleetTickerInTopBar ? "ON" : "OFF"}
              </Pill>
            </div>
          </div>
        </Cell>
      </div>

      <div style={{ padding: "0 16px 24px" }}>
        <SettingsFlags />
      </div>

      <div style={{ padding: "0 16px 24px" }}>
        <SettingsCategories />
      </div>

      <SectionHead>ABOUT</SectionHead>
      <div
        style={{
          padding: "12px 16px",
          fontFamily: T.mono,
          fontSize: 11,
          color: T.inkMuted,
          lineHeight: 1.7,
        }}
      >
        Backbar v0.4.1 — local-first home-bar OS. inventory · weight-based depletion · recipes · AI mixology.
        <br />
        <span style={{ color: T.inkDim }}>spec: backbar-architecture-spec.md · build target: bun + react + sqlite</span>
      </div>
    </div>
  );
}

function SettingRadio<V extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: V;
  options: readonly V[];
  onChange(v: V): void;
}) {
  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: "0.14em", color: T.inkMuted, marginBottom: 6 }}>
        {label.toUpperCase()}
      </div>
      <div style={{ display: "flex", border: `1px solid ${T.hairline2}` }}>
        {options.map((opt, i) => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            style={{
              flex: 1,
              padding: "7px 0",
              background: opt === value ? T.cyanGlow : "transparent",
              color: opt === value ? T.ink : T.inkMuted,
              fontFamily: T.mono,
              fontSize: 11,
              letterSpacing: "0.08em",
              border: "none",
              borderRight: i < options.length - 1 ? `1px solid ${T.hairline2}` : "none",
              cursor: "pointer",
              textTransform: "uppercase",
            }}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

function formatReset(r: AdminResetBarResponse): string {
  return `reset bar → ${r.deleted.bottles} bottles, ${r.deleted.products} products deleted`;
}

function formatResetRecipes(r: AdminResetRecipesResponse): string {
  return `reset recipes → ${r.deleted.recipes} recipes deleted`;
}

function formatReseed(r: AdminReseedResponse): string {
  const p = r.report.products;
  const b = r.report.bottles;
  const rc = r.report.recipes;
  const cats = r.report.categories;
  return [
    `reseed →`,
    cats ? `  categories +${cats.inserted} new, ${cats.skipped} already present` : null,
    `  products  +${p.inserted} new, ${p.skipped} already present`,
    `  bottles   +${b.inserted} new, ${b.skipped} already present`,
    `  recipes   +${rc.inserted} new, ${rc.skipped} already present`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}
