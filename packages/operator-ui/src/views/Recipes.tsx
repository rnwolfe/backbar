/**
 * Recipes screen — makeability triage (makeable / one-away / unmakeable)
 * + AI ideate panel. Wired directly to POST /ai/ideate; failures surface
 * the server's structured `{ok:false, reason}` so the operator can act on
 * them (off-inventory → suggest shopping muse; ai-disabled → gateway).
 */
import { useMemo, useState, type CSSProperties } from "react";
import { api, type IdeateResponse, type IdeateSpec } from "../api/client";
import { Cell, Pill, SectionHead } from "../console/Cells";
import { PageHead } from "../console/Chrome";
import { T, accent } from "../console/tokens";
import { joinRecipes, type JoinedRecipe } from "../data/derive";
import { store, useStore } from "../store/useStore";
import { useViewport } from "../util/useViewport";

interface Props {
  onPickRecipe?(r: JoinedRecipe): void;
  onAddRecipe?(): void;
  onEditRecipe?(r: import("@backbar/core").Recipe): void;
  onDuplicateRecipe?(r: import("@backbar/core").Recipe): void;
  onImportPhoto?(): void;
}

type AiMode = "now" | "riff" | "muse";

const MODE_LABEL: Record<AiMode, string> = {
  now: "MAKE NOW",
  riff: "RIFF",
  muse: "SHOPPING MUSE",
};

/** UI state for whichever AI flow last fired; null until first invocation. */
type AiState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; spec: IdeateSpec; saved_recipe_id?: string }
  | { kind: "off-inventory"; reason: string; last_spec?: IdeateSpec; muse_hint?: string }
  | { kind: "muse"; ranked: { product: { id: string; name?: string | null }; unlocks: string[] }[] }
  | { kind: "error"; message: string };

export function Recipes({
  onPickRecipe,
  onAddRecipe,
  onEditRecipe,
  onDuplicateRecipe,
  onImportPhoto,
}: Props) {
  const tweaks = useStore((s) => s.tweaks);
  const products = useStore((s) => s.products);
  const recipesRaw = useStore((s) => s.recipes);
  const makeable = useStore((s) => s.makeable);
  const bottlesCount = useStore((s) => s.bottles.length);
  const { isMobile } = useViewport();
  const A = accent(tweaks.accent).primary;

  const joined = useMemo(
    () => joinRecipes(recipesRaw, makeable, products),
    [recipesRaw, makeable, products],
  );
  const makeableList = joined.filter((r) => r.status === "makeable");
  const oneAway = joined.filter((r) => r.status === "one-away");
  const unmakeable = joined.filter((r) => r.status === "unmakeable");

  const [filter, setFilter] = useState<string>("all");
  const [aiPrompt, setAiPrompt] = useState("something stirred, smoky, low-sugar");
  const [aiMode, setAiMode] = useState<AiMode>("now");
  const [aiRiffRecipeId, setAiRiffRecipeId] = useState<string | undefined>(undefined);
  const [aiState, setAiState] = useState<AiState>({ kind: "idle" });

  const families = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of joined) counts.set(r.family, (counts.get(r.family) ?? 0) + 1);
    return [
      { id: "all", label: "All recipes", n: joined.length },
      ...Array.from(counts.entries()).map(([id, n]) => ({ id, label: `${id} root`, n })),
    ];
  }, [joined]);

  const methodCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of joined) counts.set(r.method, (counts.get(r.method) ?? 0) + 1);
    return ["stir", "shake", "build", "swizzle", "blend"].map((m) => ({ m, n: counts.get(m) ?? 0 }));
  }, [joined]);

  const filterFn = (r: JoinedRecipe) => filter === "all" || r.family === filter;

  const ideate = async () => {
    setAiState({ kind: "loading" });
    try {
      if (aiMode === "muse") {
        // Shopping muse is a different endpoint — same panel UX surface.
        const res = await api.shoppingMuse(false);
        setAiState({ kind: "muse", ranked: res.ranked });
        return;
      }
      if (aiMode === "riff" && !aiRiffRecipeId) {
        setAiState({
          kind: "error",
          message: "RIFF mode requires a base recipe — pick one from the triage or save an idea first.",
        });
        return;
      }
      const body: { brief: string; mode: "now" | "riff"; recipe_id?: string } = {
        brief: aiPrompt,
        mode: aiMode,
      };
      if (aiMode === "riff" && aiRiffRecipeId) body.recipe_id = aiRiffRecipeId;
      const res = (await api.ideate(body)) as IdeateResponse;
      if (res.ok) {
        setAiState({ kind: "ok", spec: res.spec });
      } else if (res.reason === "off-inventory") {
        setAiState({
          kind: "off-inventory",
          reason: res.reason,
          last_spec: res.last_spec,
          muse_hint: res.muse_hint,
        });
      } else {
        setAiState({ kind: "error", message: `ideate gave up — ${res.reason}` });
      }
    } catch (e) {
      setAiState({ kind: "error", message: e instanceof Error ? e.message : "ideate failed" });
    }
  };

  const saveAiSpec = async (spec: IdeateSpec): Promise<string | null> => {
    // Convert the AI spec into the server's Recipe shape and POST it.
    // The AI emits `product_ref` (catalog id) without a human label — we look
    // up the display label here so the saved recipe isn't full of null refs.
    const slug = spec.name
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60);
    const productById = new Map(products.map((p) => [p.id, p]));
    const recipePayload = {
      id: slug,
      name: spec.name,
      family: spec.family ?? null,
      method: spec.method ?? null,
      glass: spec.glass ?? null,
      ice: spec.ice ?? null,
      garnish: spec.garnish ?? null,
      source: "ai",
      provenance: "ideate",
      abv_estimate: spec.abv_estimate ?? null,
      balance: spec.predicted_balance ?? null,
      is_published: false,
      tags: [],
      ingredients: (spec.ingredients ?? []).map((ing, i) => ({
        ref_type: ing.ref_type,
        ref_id: ing.product_ref,
        label:
          ing.ref_type === "product"
            ? productById.get(ing.product_ref)?.name ?? ing.product_ref
            : ing.product_ref,
        amount: ing.amount,
        unit: ing.unit,
        optional: false,
        garnish: false,
        sort: i,
      })),
    };
    try {
      const saved = (await api.createRecipe(recipePayload)) as { id: string };
      await store.hydrate();
      return saved.id;
    } catch (e) {
      setAiState({ kind: "error", message: e instanceof Error ? e.message : "save failed" });
      return null;
    }
  };

  const handleSave = async () => {
    if (aiState.kind !== "ok") return;
    const id = await saveAiSpec(aiState.spec);
    if (id) setAiState({ kind: "ok", spec: aiState.spec, saved_recipe_id: id });
  };

  const handleRiff = () => {
    if (aiState.kind !== "ok" || !aiState.saved_recipe_id) {
      setAiState({
        kind: "error",
        message: "Save the recipe first so RIFF has a base to riff on.",
      });
      return;
    }
    setAiMode("riff");
    setAiRiffRecipeId(aiState.saved_recipe_id);
    setAiPrompt((p) => `${p} — riff one axis`);
  };

  const handlePourNow = async () => {
    if (aiState.kind !== "ok") return;
    const id = aiState.saved_recipe_id ?? (await saveAiSpec(aiState.spec));
    if (!id) return;
    // Hydrate then locate + open the recipe detail overlay so the operator
    // confirms bindings and commits the pour.
    await store.hydrate();
    const joined = joinRecipes(store.get().recipes, store.get().makeable, store.get().products);
    const target = joined.find((r) => r.id === id);
    if (target) onPickRecipe?.(target);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        flex: 1,
        minHeight: 0,
        position: "relative",
        zIndex: 1,
      }}
    >
      <aside
        style={{
          width: 200,
          borderRight: `1px solid ${T.hairline}`,
          background: T.surface,
          flexShrink: 0,
          display: isMobile ? "none" : "flex",
          flexDirection: "column",
        }}
      >
        <SectionHead right={`${joined.length}`}>LIBRARY</SectionHead>
        <div style={{ padding: "8px 0" }}>
          {families.map((f) => (
            <div
              key={f.id}
              onClick={() => setFilter(f.id)}
              style={{
                padding: "6px 16px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                cursor: "pointer",
                background: filter === f.id ? T.surface2 : "transparent",
              }}
            >
              <span style={{ fontSize: 12, color: filter === f.id ? T.ink : T.inkMuted }}>{f.label}</span>
              <span style={{ fontFamily: T.mono, fontSize: 10, color: T.inkDim }}>{f.n}</span>
            </div>
          ))}
        </div>
        <SectionHead style={{ marginTop: 8 }}>METHOD</SectionHead>
        <div style={{ padding: "8px 16px", display: "flex", flexDirection: "column", gap: 5 }}>
          {methodCounts.map(({ m, n }) => (
            <div
              key={m}
              style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: T.ink }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 10, height: 10, border: `1px solid ${T.inkDim}` }} />
                {m}
              </span>
              <span style={{ fontFamily: T.mono, fontSize: 10, color: T.inkDim }}>{n}</span>
            </div>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ borderTop: `1px solid ${T.hairline}`, padding: "12px 16px" }}>
          <div style={{ fontSize: 10, letterSpacing: "0.14em", color: T.inkMuted, marginBottom: 8 }}>BALANCE AXES</div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "4px 10px",
              fontFamily: T.mono,
              fontSize: 10,
              color: T.inkDim,
            }}
          >
            <span>sweet</span>
            <span>sour</span>
            <span>bitter</span>
            <span>strong</span>
            <span>aromatic</span>
            <span>dilution</span>
          </div>
        </div>
      </aside>

      <div
        style={{
          flex: 1,
          padding: "10px 14px",
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
        }}
      >
        <PageHead
          title="Recipe Library"
          meta={`${joined.length} recipes · live makeability against ${bottlesCount} bottles · ${makeableList.length} green · ${oneAway.length} amber · ${unmakeable.length} red`}
          actions={
            <>
              <Pill color={A} onClick={onAddRecipe} title="hand-enter a new recipe">
                + NEW
              </Pill>
              <Pill color={A} onClick={onImportPhoto} title="OCR a book page or printout into a recipe draft">
                ↑ IMPORT PHOTO
              </Pill>
            </>
          }
        />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr",
            gap: 10,
            padding: "0 16px",
            paddingBottom: 24,
          }}
        >
          <RecipeColumn
            title="MAKEABLE NOW"
            color={T.green}
            recipes={makeableList.filter(filterFn)}
            onPick={onPickRecipe}
            onEdit={onEditRecipe}
            onDuplicate={onDuplicateRecipe}
            accent={A}
            status="makeable"
          />
          <RecipeColumn
            title="ONE BOTTLE AWAY"
            color={T.amber}
            recipes={oneAway.filter(filterFn)}
            onPick={onPickRecipe}
            onEdit={onEditRecipe}
            onDuplicate={onDuplicateRecipe}
            accent={A}
            status="one-away"
          />
          <RecipeColumn
            title="OUT OF REACH"
            color={T.inkDim}
            recipes={unmakeable.filter(filterFn)}
            onPick={onPickRecipe}
            onEdit={onEditRecipe}
            onDuplicate={onDuplicateRecipe}
            accent={A}
            status="unmakeable"
          />
        </div>
      </div>

      <aside
        style={{
          width: isMobile ? "auto" : 340,
          borderLeft: isMobile ? "none" : `1px solid ${T.hairline}`,
          borderTop: isMobile ? `1px solid ${T.hairline}` : "none",
          background: T.surface,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <SectionHead right="vercel · gw">AI MIXOLOGY</SectionHead>
        <div
          style={{
            padding: "14px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
            overflow: "auto",
            flex: 1,
          }}
        >
          <div>
            <div style={{ fontSize: 10, letterSpacing: "0.14em", color: T.inkMuted, marginBottom: 6 }}>MODE</div>
            <div style={{ display: "flex", border: `1px solid ${T.hairline2}` }}>
              {(["now", "riff", "muse"] as AiMode[]).map((m, i, arr) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setAiMode(m)}
                  style={{
                    flex: 1,
                    padding: "6px 0",
                    fontSize: 10,
                    fontFamily: T.mono,
                    letterSpacing: "0.06em",
                    background: aiMode === m ? T.cyanGlow : "transparent",
                    color: aiMode === m ? A : T.inkMuted,
                    border: "none",
                    borderRight: i < arr.length - 1 ? `1px solid ${T.hairline2}` : "none",
                    cursor: "pointer",
                  }}
                >
                  {MODE_LABEL[m]}
                </button>
              ))}
            </div>
            {aiMode === "riff" ? (
              <div style={{ fontSize: 10, color: T.inkMuted, marginTop: 6, fontFamily: T.mono }}>
                {aiRiffRecipeId
                  ? `riffing on ${aiRiffRecipeId}`
                  : "pick a base via SAVE first, or RIFF on a saved AI draft"}
              </div>
            ) : null}
            {aiMode === "muse" ? (
              <div style={{ fontSize: 10, color: T.inkMuted, marginTop: 6, fontFamily: T.mono }}>
                ranks one-bottle-away gaps by how many recipes they'd unlock
              </div>
            ) : null}
          </div>

          <div>
            <div style={{ fontSize: 10, letterSpacing: "0.14em", color: T.inkMuted, marginBottom: 6 }}>BRIEF</div>
            <textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              rows={3}
              style={{
                width: "100%",
                resize: "vertical",
                background: T.surface2,
                border: `1px solid ${T.hairline2}`,
                color: T.ink,
                fontFamily: T.body,
                fontSize: 13,
                padding: "8px 10px",
                outline: "none",
                borderRadius: 0,
              }}
            />
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              {["smoky", "low-sugar", "stirred", "equal-parts", "use Cocchi", "≤25% ABV"].map((c) => (
                <span
                  key={c}
                  onClick={() => setAiPrompt((p) => (p.includes(c) ? p : `${p}, ${c}`))}
                  style={{
                    padding: "3px 8px",
                    fontSize: 10,
                    fontFamily: T.mono,
                    color: T.inkMuted,
                    border: `1px solid ${T.hairline2}`,
                    cursor: "pointer",
                  }}
                >
                  + {c}
                </span>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => void ideate()}
            disabled={aiState.kind === "loading"}
            style={{
              padding: "10px 0",
              background: aiState.kind === "loading" ? T.surface2 : A,
              color: aiState.kind === "loading" ? T.inkMuted : T.bg,
              border: "none",
              fontFamily: T.mono,
              fontSize: 12,
              letterSpacing: "0.12em",
              fontWeight: 600,
              cursor: aiState.kind === "loading" ? "wait" : "pointer",
            }}
          >
            {aiState.kind === "loading" ? "GENERATING…" : aiMode === "muse" ? "✦ RANK MUSE" : "✦ IDEATE"}
          </button>

          {aiState.kind === "error" ? (
            <div
              style={{
                padding: "10px 12px",
                fontSize: 11,
                color: T.red,
                background: T.redGlow,
                border: `1px solid ${T.red}`,
                fontFamily: T.mono,
                lineHeight: 1.5,
              }}
            >
              ⚠ {aiState.message}
            </div>
          ) : null}

          {aiState.kind === "off-inventory" ? (
            <div
              style={{
                padding: "10px 12px",
                fontSize: 11,
                color: T.amber,
                background: T.amberGlow,
                border: `1px solid ${T.amberDim}`,
                fontFamily: T.mono,
                lineHeight: 1.6,
              }}
            >
              ⚠ ideate gave up — the model kept referencing bottles you don't have.
              {aiState.muse_hint ? (
                <>
                  <br />
                  {aiState.muse_hint}
                </>
              ) : null}
              <div style={{ marginTop: 8 }}>
                <Pill color={T.amber} active onClick={() => setAiMode("muse")}>
                  TRY SHOPPING MUSE
                </Pill>
              </div>
            </div>
          ) : null}

          {aiState.kind === "ok" ? (
            <AIResultCard
              spec={aiState.spec}
              products={products}
              savedRecipeId={aiState.saved_recipe_id}
              accentColor={A}
              onSave={() => void handleSave()}
              onRiff={handleRiff}
              onPourNow={() => void handlePourNow()}
            />
          ) : null}

          {aiState.kind === "muse" ? <MuseResults rows={aiState.ranked} accentColor={A} /> : null}

          {aiState.kind === "idle" ? (
            <div
              style={{
                marginTop: "auto",
                padding: "12px 14px",
                border: `1px dashed ${T.hairline2}`,
                fontSize: 11,
                color: T.inkMuted,
                lineHeight: 1.5,
              }}
            >
              <div
                style={{
                  fontFamily: T.mono,
                  fontSize: 9,
                  letterSpacing: "0.14em",
                  color: T.inkDim,
                  marginBottom: 6,
                }}
              >
                HOW IT WORKS
              </div>
              Brief + your live inventory → Zod-validated recipe spec, balance prediction
              (sweet/sour/bitter/strong/aromatic/dilution), and an ABV estimate. Ingredients are bound to bottles
              you actually own; the server rejects any miss and reports {`{ok:false, reason}`} — no silent swaps.
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function RecipeColumn({
  title,
  color,
  recipes,
  onPick,
  onEdit,
  onDuplicate,
  accent: accentColor,
  status,
}: {
  title: string;
  color: string;
  recipes: JoinedRecipe[];
  onPick?(r: JoinedRecipe): void;
  onEdit?(r: import("@backbar/core").Recipe): void;
  onDuplicate?(r: import("@backbar/core").Recipe): void;
  accent: string;
  status: JoinedRecipe["status"];
}) {
  return (
    <Cell title={title} right={`${recipes.length}`} style={{ borderTop: `2px solid ${color}` }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          overflow: "auto",
          flex: 1,
          gap: 6,
          marginTop: 4,
          paddingBottom: 4,
        }}
      >
        {recipes.length === 0 ? (
          <div style={{ padding: "8px 0", fontSize: 12, color: T.inkMuted }}>—</div>
        ) : (
          recipes.map((r) => (
            <RecipeCard
              key={r.id}
              r={r}
              color={color}
              accent={accentColor}
              status={status}
              onClick={() => onPick?.(r)}
              onEdit={onEdit ? () => onEdit(r.raw) : undefined}
              onDuplicate={onDuplicate ? () => onDuplicate(r.raw) : undefined}
            />
          ))
        )}
      </div>
    </Cell>
  );
}

function RecipeCard({
  r,
  color,
  accent: accentColor,
  status,
  onClick,
  onEdit,
  onDuplicate,
}: {
  r: JoinedRecipe;
  color: string;
  accent: string;
  status: JoinedRecipe["status"];
  onClick(): void;
  onEdit?(): void;
  onDuplicate?(): void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: "10px 12px",
        background: T.surface2,
        border: `1px solid ${T.hairline}`,
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 5,
        transition: "border-color 0.12s, background 0.12s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = color;
        (e.currentTarget as HTMLDivElement).style.background = T.surface3;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = T.hairline;
        (e.currentTarget as HTMLDivElement).style.background = T.surface2;
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, justifyContent: "space-between" }}>
        <div style={{ fontSize: 14, color: T.ink, fontWeight: 500 }}>{r.name}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {onEdit ? <CardAction label="EDIT" title="edit recipe" onClick={onEdit} /> : null}
          {onDuplicate ? <CardAction label="DUP" title="duplicate recipe" onClick={onDuplicate} /> : null}
          <div style={{ fontFamily: T.mono, fontSize: 9, color, letterSpacing: "0.1em" }}>
            {status === "makeable" ? "✓" : status === "one-away" ? "◆" : "○"}
          </div>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          gap: 8,
          fontFamily: T.mono,
          fontSize: 9,
          color: T.inkDim,
          letterSpacing: "0.06em",
        }}
      >
        <span>{r.family}</span>
        <span>·</span>
        <span>{r.method}</span>
        <span>·</span>
        <span>{r.glass}</span>
        <span>·</span>
        <span>{Math.round(r.abv * 100)}% ABV</span>
      </div>
      {r.one_away || r.unmakeable ? (
        <div style={{ fontSize: 10, color, marginTop: 2, fontStyle: "italic" }}>{r.one_away ?? r.unmakeable}</div>
      ) : null}
      <div style={{ display: "flex", gap: 2, marginTop: 3, height: 3 }}>
        {r.balance.map((v, i) => (
          <div key={i} style={{ flex: 1, background: T.hairline2, position: "relative" }}>
            <div
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: 0,
                width: `${v * 100}%`,
                background: status === "makeable" ? accentColor : T.inkMuted,
                opacity: 0.75,
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function CardAction({
  label,
  title,
  onClick,
}: {
  label: string;
  title: string;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{
        padding: "2px 6px",
        background: "transparent",
        border: `1px solid ${T.hairline2}`,
        color: T.inkMuted,
        fontFamily: T.mono,
        fontSize: 9,
        letterSpacing: "0.12em",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.color = T.ink;
        (e.currentTarget as HTMLButtonElement).style.borderColor = T.cyan;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.color = T.inkMuted;
        (e.currentTarget as HTMLButtonElement).style.borderColor = T.hairline2;
      }}
    >
      {label}
    </button>
  );
}

function AIResultCard({
  spec,
  products,
  savedRecipeId,
  accentColor,
  onSave,
  onRiff,
  onPourNow,
}: {
  spec: IdeateSpec;
  products: { id: string; name: string }[];
  savedRecipeId?: string;
  accentColor: string;
  onSave(): void;
  onRiff(): void;
  onPourNow(): void;
}) {
  const total = spec.ingredients.reduce((s, ing) => s + (toMl(ing.amount, ing.unit) ?? 0), 0);
  const productById = new Map(products.map((p) => [p.id, p]));
  const resolveLabel = (ing: IdeateSpec["ingredients"][number]): string => {
    if (ing.ref_type === "product") {
      return productById.get(ing.product_ref)?.name ?? ing.product_ref;
    }
    // category refs render as "any <category>" — clearer than the bare id
    return `any ${ing.product_ref}`;
  };
  const cardStyle: CSSProperties = {
    border: `1px solid ${accentColor}`,
    background: T.surface2,
    padding: "12px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    position: "relative",
  };
  const abv = spec.abv_estimate ?? 0;
  return (
    <div style={cardStyle}>
      <div style={{ position: "absolute", top: -1, left: -1, right: -1, height: 2, background: accentColor }} />
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 9, fontFamily: T.mono, color: accentColor, letterSpacing: "0.18em" }}>
            AI-GENERATED · {savedRecipeId ? "SAVED" : "DRAFT"}
          </div>
          <div style={{ fontSize: 18, color: T.ink, fontWeight: 500, letterSpacing: "-0.01em", marginTop: 2 }}>
            {spec.name}
          </div>
        </div>
        <div style={{ fontFamily: T.mono, fontSize: 10, color: T.inkMuted }}>{Math.round(abv * 100)}% ABV</div>
      </div>
      <div style={{ fontFamily: T.mono, fontSize: 9, color: T.inkDim, letterSpacing: "0.06em" }}>
        {spec.family ?? "—"} · {spec.method ?? "—"} · {spec.glass ?? "—"} · ice: {spec.ice ?? "—"}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 4 }}>
        {spec.ingredients.map((ing, i) => {
          const label = resolveLabel(ing);
          const isCategory = ing.ref_type === "category";
          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 8,
                fontSize: 12,
                padding: "3px 0",
                borderBottom: `1px solid ${T.hairline}`,
              }}
              title={`${ing.ref_type}: ${ing.product_ref} · ${ing.amount} ${ing.unit}`}
            >
              <span style={{ color: accentColor, fontFamily: T.mono, fontSize: 9, width: 20 }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <span style={{ color: T.ink, flex: 1, fontStyle: isCategory ? "italic" : "normal" }}>
                {label}
              </span>
              <span style={{ fontFamily: T.mono, fontSize: 11, color: T.inkMuted }}>
                {ing.amount} {ing.unit}
              </span>
            </div>
          );
        })}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 4,
            fontFamily: T.mono,
            fontSize: 10,
            color: T.inkDim,
            letterSpacing: "0.04em",
          }}
        >
          <span>garnish · {spec.garnish ?? "—"}</span>
          <span>{total.toFixed(1)}ml</span>
        </div>
      </div>
      {spec.rationale ? (
        <div
          style={{
            fontSize: 11,
            color: T.inkMuted,
            lineHeight: 1.5,
            fontStyle: "italic",
            marginTop: 4,
            paddingTop: 8,
            borderTop: `1px solid ${T.hairline}`,
          }}
        >
          {spec.rationale}
        </div>
      ) : null}
      {spec.risk_note ? (
        <div
          style={{
            fontSize: 10,
            color: T.amber,
            lineHeight: 1.4,
            padding: "6px 8px",
            background: "rgba(233,166,72,0.06)",
            border: `1px solid ${T.amberDim}`,
          }}
        >
          ⚠ {spec.risk_note}
        </div>
      ) : null}
      <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
        <Pill color={accentColor} active={!savedRecipeId} disabled={!!savedRecipeId} onClick={onSave}>
          {savedRecipeId ? "✓ SAVED" : "SAVE"}
        </Pill>
        <Pill onClick={onRiff} disabled={!savedRecipeId} title={savedRecipeId ? "" : "save first"}>
          RIFF
        </Pill>
        <Pill onClick={onPourNow}>POUR NOW</Pill>
      </div>
    </div>
  );
}

function MuseResults({
  rows,
  accentColor,
}: {
  rows: { product: { id: string; name?: string | null }; unlocks: string[] }[];
  accentColor: string;
}) {
  return (
    <div
      style={{
        border: `1px solid ${accentColor}`,
        background: T.surface2,
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ fontSize: 9, fontFamily: T.mono, color: accentColor, letterSpacing: "0.18em" }}>
        SHOPPING MUSE · GREEDY COVERAGE
      </div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 12, color: T.inkMuted }}>
          No one-bottle-away gaps — your bar already covers the catalog.
        </div>
      ) : (
        rows.slice(0, 6).map((r) => (
          <div
            key={r.product.id}
            style={{
              padding: "8px 10px",
              background: T.bg,
              border: `1px solid ${T.hairline}`,
              display: "flex",
              alignItems: "baseline",
              gap: 10,
            }}
            title={`unlocks: ${r.unlocks.join(", ")}`}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: T.ink, fontWeight: 500 }}>{r.product.name ?? r.product.id}</div>
              <div style={{ fontSize: 10, color: T.inkMuted, fontFamily: T.mono, marginTop: 2 }}>
                unlocks {r.unlocks.length} {r.unlocks.length === 1 ? "recipe" : "recipes"}
              </div>
            </div>
            <div style={{ fontFamily: T.mono, fontSize: 13, color: accentColor }}>+{r.unlocks.length}</div>
          </div>
        ))
      )}
    </div>
  );
}

/** Rough display-only conversion — matches data/derive.ts so totals line up. */
function toMl(amount: number, unit: string): number {
  switch (unit) {
    case "ml":
      return amount;
    case "dash":
      return amount * 0.9;
    case "barspoon":
      return amount * 5;
    default:
      return amount;
  }
}
