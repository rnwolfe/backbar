/**
 * Propose → confirm. The agent never mutates; a `propose_*` tool returns a
 * structured proposal and this card surfaces the confirm action, which calls
 * the existing REST endpoints (create recipe / publish menu / 86 a bottle).
 * Those emit bus events → /live → the rest of the console updates.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { T, accent } from "../console/tokens";
import { store, useStore } from "../store/useStore";
import { EntityChip } from "./EntityChip";

interface Props {
  toolName: string;
  output: unknown;
  notify: (msg: string) => void;
}

const slug = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "drink";

export function ProposalCard({ toolName, output, notify }: Props) {
  const navigate = useNavigate();
  const tweaks = useStore((s) => s.tweaks);
  const A = accent(tweaks.accent).primary;
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const o = output as Record<string, unknown>;
  if (!o || typeof o !== "object") return null;

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      setDone(label);
    } catch (e) {
      notify(e instanceof Error ? e.message : "action failed");
    } finally {
      setBusy(false);
    }
  };

  // ── propose_recipe ────────────────────────────────────────────────────
  if (toolName === "propose_recipe" && o.kind === "recipe") {
    const p = o.proposal as {
      name: string;
      family?: string;
      method: string;
      glass?: string;
      ice?: string;
      garnish?: string;
      instructions?: string;
      ingredients: { ref: string; ref_type: string; amount: number; unit: string; label?: string; optional?: boolean; garnish?: boolean }[];
    };
    const save = () =>
      run("saved", async () => {
        const id = slug(p.name);
        const recipe = {
          id,
          name: p.name,
          family: p.family ?? null,
          method: p.method,
          glass: p.glass ?? null,
          ice: p.ice ?? null,
          garnish: p.garnish ?? null,
          instructions: p.instructions ?? null,
          source: "ai",
          provenance: "ai-chat",
          abv_estimate: o.final_abv ?? null,
          balance: o.balance ?? null,
          is_published: false,
          tags: [],
          ingredients: p.ingredients.map((ing, i) => ({
            ref_type: ing.ref_type,
            ref_id: ing.ref,
            label: ing.label ?? ing.ref,
            amount: ing.amount,
            unit: ing.unit,
            optional: ing.optional ?? false,
            garnish: ing.garnish ?? false,
            sort: i,
          })),
        };
        await api.createRecipe(recipe);
        await store.refreshRecipes();
        notify(`saved ${p.name}`);
        navigate(`/recipes/${id}`);
      });

    return (
      <Shell accent={A} title={p.name} sub={`${p.family ?? "cocktail"} · ${p.method}`}>
        <ul style={{ margin: "0 0 8px", paddingLeft: 16, display: "grid", gap: 2, color: T.ink, fontSize: 12 }}>
          {p.ingredients.map((ing, i) => (
            <li key={i}>
              {ing.amount} {ing.unit} {ing.label ?? ing.ref}
            </li>
          ))}
        </ul>
        <Meta>
          <span style={{ color: o.makeable ? T.green : T.red }}>
            {o.makeable ? "✓ makeable" : `✗ missing: ${(o.missing as string[]).join(", ")}`}
          </span>
          {o.final_abv != null ? <span style={{ color: T.inkMuted }}>{Math.round(Number(o.final_abv) * 100)}% ABV</span> : null}
        </Meta>
        <Actions>
          {done ? (
            <Done label="saved ✓" />
          ) : (
            <Btn primary accent={A} disabled={busy || !o.makeable} onClick={save}>
              {busy ? "saving…" : "Save recipe"}
            </Btn>
          )}
        </Actions>
      </Shell>
    );
  }

  // ── propose_menu_publish ──────────────────────────────────────────────
  if (toolName === "propose_menu_publish" && o.kind === "menu_publish") {
    const items = (o.items as { id: string; name: string }[]) ?? [];
    const publish = () =>
      run("published", async () => {
        await api.publishMenu(items.map((i) => i.id));
        notify(`published ${items.length} to the guest menu`);
      });
    return (
      <Shell accent={A} title="Guest menu" sub={`${items.length} drinks`}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {items.map((i) => (
            <EntityChip key={i.id} kind="recipe" id={i.id} />
          ))}
        </div>
        <Actions>
          {done ? <Done label="published ✓" /> : (
            <Btn primary accent={A} disabled={busy || !items.length} onClick={publish}>
              {busy ? "publishing…" : "Publish to guest menu"}
            </Btn>
          )}
        </Actions>
      </Shell>
    );
  }

  // ── propose_86_bottle ─────────────────────────────────────────────────
  if (toolName === "propose_86_bottle" && o.kind === "eighty_six") {
    const id = String(o.bottle_id);
    const apply = () =>
      run("86'd", async () => {
        await api.patchBottle(id, { status: "empty" });
        await store.hydrate();
        notify(`86'd ${id}`);
      });
    return (
      <Shell accent={A} title="86 a bottle" sub={o.found ? "" : "bottle not found"}>
        <div style={{ marginBottom: 8 }}>
          <EntityChip kind="bottle" id={id} />
        </div>
        <Actions>
          {done ? <Done label="86'd ✓" /> : (
            <Btn primary accent={A} disabled={busy || !o.found} onClick={apply}>
              {busy ? "applying…" : "86 it"}
            </Btn>
          )}
        </Actions>
      </Shell>
    );
  }

  return null;
}

function Shell({ accent: A, title, sub, children }: { accent: string; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div style={{ border: `1px solid ${A}`, background: T.surface, padding: "10px 11px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
        <span style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: A }}>
          proposal
        </span>
        <span style={{ color: T.ink, fontWeight: 600 }}>{title}</span>
        {sub ? <span style={{ color: T.inkMuted, fontSize: 11 }}>{sub}</span> : null}
      </div>
      {children}
    </div>
  );
}
function Meta({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", gap: 12, fontSize: 11, marginBottom: 10 }}>{children}</div>;
}
function Actions({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", gap: 8 }}>{children}</div>;
}
function Done({ label }: { label: string }) {
  return <span style={{ color: T.green, fontFamily: T.mono, fontSize: 12 }}>{label}</span>;
}
function Btn({ children, onClick, disabled, primary, accent: A }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; primary?: boolean; accent: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "7px 12px",
        background: primary ? (disabled ? T.surface2 : A) : "transparent",
        color: primary ? (disabled ? T.inkDim : T.bg) : T.ink,
        border: `1px solid ${disabled ? T.hairline2 : A}`,
        fontFamily: T.mono,
        fontSize: 11,
        letterSpacing: "0.06em",
        cursor: disabled ? "default" : "pointer",
        fontWeight: 600,
      }}
    >
      {children}
    </button>
  );
}
