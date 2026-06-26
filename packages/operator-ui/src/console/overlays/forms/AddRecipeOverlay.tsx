/**
 * Add / Edit / Duplicate Recipe.
 *
 *   create    → POST /recipes
 *   edit      → PATCH /recipes/:id (server replaces ingredients atomically)
 *   duplicate → POST /recipes with a fresh "-copy" slug
 *
 * Minimum-viable shape: name, family, method, glass/ice + ingredient list.
 * Balance axes + tag editor are a follow-up.
 */
import { useMemo, useState } from "react";
import type { Recipe } from "@backbar/core";
import { api } from "../../../api/client";
import { store, useStore } from "../../../store/useStore";
import { T } from "../../tokens";
import { ConSelect } from "../../Select";
import { FormInput, FormRow, FormShell, FormTextarea, toSlug } from "./FormShell";

export type RecipeOverlayMode = "create" | "edit" | "duplicate";

interface IngredientRow {
  ref_type: "product" | "category" | "tag" | "freeform" | "component";
  ref_id: string;
  label: string;
  amount: string;
  // mirrors the core Unit enum
  unit: "ml" | "oz" | "dash" | "barspoon" | "tsp" | "tbsp" | "cup" | "drop" | "pinch" | "each" | "leaf" | "top";
  optional: boolean;
  garnish: boolean;
}

const UNIT_OPTIONS = [
  "ml",
  "oz",
  "dash",
  "barspoon",
  "tsp",
  "tbsp",
  "cup",
  "drop",
  "pinch",
  "each",
  "leaf",
  "top",
] as const;

const EMPTY_ING: IngredientRow = {
  ref_type: "product",
  ref_id: "",
  label: "",
  amount: "30",
  unit: "ml",
  optional: false,
  garnish: false,
};

interface Props {
  onClose(): void;
  onToast?(text: string): void;
  mode?: RecipeOverlayMode;
  initial?: Recipe;
}

interface SeedState {
  id: string;
  name: string;
  family: string;
  method: IngredientRow["unit"] extends never ? never : "build" | "stir" | "shake" | "swizzle" | "blend" | "throw";
  glass: string;
  ice: string;
  garnish: string;
  instructions: string;
  isPublished: boolean;
  ingredients: IngredientRow[];
  tags: string[];
}

function recipeToSeed(mode: RecipeOverlayMode, initial?: Recipe): SeedState {
  const duplicate = mode === "duplicate";
  if (!initial || mode === "create") {
    return {
      id: "",
      name: "",
      family: "spirit-forward",
      method: "stir",
      glass: "rocks",
      ice: "large-format",
      garnish: "",
      instructions: "",
      isPublished: false,
      ingredients: [{ ...EMPTY_ING }],
      tags: [],
    };
  }
  return {
    id: duplicate ? `${initial.id}-copy` : initial.id,
    name: duplicate ? `${initial.name} (copy)` : initial.name,
    family: initial.family ?? "spirit-forward",
    method: (initial.method ?? "stir") as SeedState["method"],
    glass: initial.glass ?? "",
    ice: initial.ice ?? "",
    garnish: initial.garnish ?? "",
    instructions: initial.instructions ?? "",
    isPublished: initial.is_published,
    ingredients:
      initial.ingredients.length > 0
        ? initial.ingredients.map((ing) => ({
            ref_type: ing.ref_type,
            ref_id: ing.ref_id ?? "",
            label: ing.label ?? "",
            amount: ing.amount != null ? String(ing.amount) : "",
            unit: (ing.unit ?? "ml") as IngredientRow["unit"],
            optional: ing.optional,
            garnish: ing.garnish,
          }))
        : [{ ...EMPTY_ING }],
    tags: [...(initial.tags ?? [])],
  };
}

export function AddRecipeOverlay({ onClose, onToast, mode = "create", initial }: Props) {
  const products = useStore((s) => s.products);
  const components = useStore((s) => s.components);
  const seed = useMemo(() => recipeToSeed(mode, initial), [mode, initial]);

  const [name, setName] = useState(seed.name);
  const [id, setId] = useState(seed.id);
  const [idTouched, setIdTouched] = useState(mode !== "create");
  const [family, setFamily] = useState(seed.family);
  const [method, setMethod] = useState<SeedState["method"]>(seed.method);
  const [glass, setGlass] = useState(seed.glass);
  const [ice, setIce] = useState(seed.ice);
  const [garnish, setGarnish] = useState(seed.garnish);
  const [instructions, setInstructions] = useState(seed.instructions);
  const [isPublished, setIsPublished] = useState(seed.isPublished);
  const [ingredients, setIngredients] = useState<IngredientRow[]>(seed.ingredients);
  const [tags, setTags] = useState<string[]>(seed.tags);
  const [tagInput, setTagInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addTag = () => {
    const v = tagInput.trim();
    if (!v) return;
    if (tags.includes(v)) {
      setTagInput("");
      return;
    }
    setTags([...tags, v]);
    setTagInput("");
  };
  const removeTag = (i: number) => setTags(tags.filter((_, j) => j !== i));

  const isEdit = mode === "edit";
  const isDuplicate = mode === "duplicate";

  const updateIng = (i: number, patch: Partial<IngredientRow>) => {
    setIngredients((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  };

  const submit = async () => {
    if (!id || !name) {
      setError("name + id are required");
      return;
    }
    if (ingredients.length === 0 || !ingredients[0]!.ref_id) {
      setError("at least one ingredient is required");
      return;
    }
    setSubmitting(true);
    setError(null);
    const payload = {
      id,
      name,
      family: family || null,
      method,
      glass: glass || null,
      ice: ice || null,
      garnish: garnish.trim() || null,
      instructions: instructions.trim() || null,
      source: isEdit ? initial?.source ?? "me" : "me",
      is_published: isPublished,
      tags,
      ingredients: ingredients
        .filter((r) => r.ref_id.trim())
        .map((r, i) => ({
          ref_type: r.ref_type,
          ref_id: r.ref_id.trim(),
          label: r.label.trim() || null,
          amount: Number.parseFloat(r.amount) || null,
          unit: r.unit,
          optional: r.optional,
          garnish: r.garnish,
          sort: i,
        })),
    };
    try {
      if (isEdit) {
        await api.patchRecipe(id, payload);
        onToast?.(`updated · ${name}`);
      } else {
        await api.createRecipe(payload);
        onToast?.(isDuplicate ? `duplicated → ${name}` : `added recipe · ${name}`);
      }
      await store.hydrate();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "save failed");
    } finally {
      setSubmitting(false);
    }
  };

  const title = isEdit ? `Edit · ${initial?.name ?? name}` : isDuplicate ? "Duplicate recipe" : "Add recipe";
  const subtitle = isEdit
    ? "Edit the spec. Ingredient list is replaced wholesale on save."
    : isDuplicate
      ? "Fresh ID, prefilled from the source. Tune what's different before save."
      : "A minimal hand-entered spec. Use Import Photo for book pages, or Ideate to draft from AI.";

  return (
    <FormShell
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      onSubmit={() => void submit()}
      submitting={submitting}
      submitDisabled={!id || !name || ingredients.every((r) => !r.ref_id)}
      submitLabel={isEdit ? "✓ SAVE CHANGES" : isDuplicate ? "✓ CREATE DUPLICATE" : "✓ SAVE"}
      error={error}
      width={680}
    >
      <FormRow label="Name">
        <FormInput
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!idTouched) setId(toSlug(e.target.value));
          }}
          placeholder="Old Fashioned"
          autoFocus
        />
      </FormRow>
      <FormRow
        label="ID (slug)"
        hint={isEdit ? "fixed on existing recipes — duplicate if you need a different slug" : undefined}
      >
        <FormInput
          value={id}
          disabled={isEdit}
          onChange={(e) => {
            setIdTouched(true);
            setId(toSlug(e.target.value));
          }}
          placeholder="old-fashioned"
        />
      </FormRow>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
        <FormRow label="Family">
          <ConSelect
            value={family}
            options={["spirit-forward", "sour", "tropical", "fizz", "highball", "other"]}
            onChange={setFamily}
          />
        </FormRow>
        <FormRow label="Method">
          <ConSelect
            value={method}
            options={["stir", "shake", "build", "swizzle", "blend", "throw"] as const}
            onChange={(v) => setMethod(v)}
          />
        </FormRow>
        <FormRow label="Glass">
          <FormInput value={glass} onChange={(e) => setGlass(e.target.value)} placeholder="rocks / coupe / flute" />
        </FormRow>
        <FormRow label="Ice">
          <FormInput value={ice} onChange={(e) => setIce(e.target.value)} placeholder="large-format / cubed / none" />
        </FormRow>
      </div>

      <FormRow label="Garnish">
        <FormInput value={garnish} onChange={(e) => setGarnish(e.target.value)} placeholder="orange peel" />
      </FormRow>

      <FormRow label="Instructions">
        <FormTextarea
          rows={2}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="Stir all ingredients with ice until well chilled; strain over large ice."
        />
      </FormRow>

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: 4 }}>
        <span style={{ fontSize: 10, color: T.inkMuted, letterSpacing: "0.14em" }}>INGREDIENTS</span>
        <button
          type="button"
          onClick={() => setIngredients((rows) => [...rows, { ...EMPTY_ING }])}
          style={{
            padding: "4px 10px",
            background: T.cyanGlow,
            color: T.cyan,
            border: `1px solid ${T.cyan}`,
            fontFamily: T.mono,
            fontSize: 10,
            letterSpacing: "0.12em",
            cursor: "pointer",
          }}
        >
          + ROW
        </button>
      </div>

      {ingredients.map((row, i) => (
        <div
          key={i}
          style={{
            display: "grid",
            gridTemplateColumns: "82px 1fr 60px 70px 36px 40px 24px",
            gap: 6,
            alignItems: "center",
            padding: "6px 8px",
            background: T.surface2,
            border: `1px solid ${T.hairline2}`,
            opacity: row.optional || row.garnish ? 0.85 : 1,
          }}
        >
          <ConSelect
            value={row.ref_type}
            options={["product", "category", "tag", "freeform", "component"] as const}
            onChange={(v) => updateIng(i, { ref_type: v as IngredientRow["ref_type"] })}
          />
          {row.ref_type === "product" ? (
            <ConSelect
              value={row.ref_id}
              options={products.map((p) => ({ value: p.id, label: p.name, hint: p.category }))}
              onChange={(v) => {
                const p = products.find((x) => x.id === v);
                updateIng(i, { ref_id: v, label: p?.name ?? row.label });
              }}
              placeholder="— pick product —"
            />
          ) : row.ref_type === "component" ? (
            <ConSelect
              value={row.ref_id}
              options={components.map((cmp) => ({ value: cmp.id, label: cmp.name, hint: cmp.kind ?? "component" }))}
              onChange={(v) => {
                const cmp = components.find((x) => x.id === v);
                updateIng(i, { ref_id: v, label: cmp?.name ?? row.label });
              }}
              placeholder="— pick component —"
            />
          ) : (
            <FormInput
              value={row.ref_id}
              onChange={(e) => updateIng(i, { ref_id: e.target.value })}
              placeholder={row.ref_type === "category" ? "bourbon" : row.ref_type === "tag" ? "sweet-vermouth" : "orange-peel"}
              style={{ fontSize: 11 }}
            />
          )}
          <FormInput
            type="number"
            step="0.1"
            value={row.amount}
            onChange={(e) => updateIng(i, { amount: e.target.value })}
            style={{ fontSize: 11, textAlign: "right" }}
          />
          <ConSelect
            value={row.unit}
            options={UNIT_OPTIONS}
            onChange={(v) => updateIng(i, { unit: v as IngredientRow["unit"] })}
          />
          <FlagToggle
            label="OPT"
            on={row.optional}
            title="optional — doesn't block makeability"
            onClick={() => updateIng(i, { optional: !row.optional })}
          />
          <FlagToggle
            label="GARN"
            on={row.garnish}
            title="garnish — accessory, doesn't block makeability or deplete a bottle"
            onClick={() => updateIng(i, { garnish: !row.garnish })}
          />
          <button
            type="button"
            onClick={() => setIngredients((rows) => rows.filter((_, j) => j !== i))}
            disabled={ingredients.length === 1}
            title="remove row"
            style={{
              background: "transparent",
              border: `1px solid ${T.hairline2}`,
              color: T.inkMuted,
              fontFamily: T.mono,
              fontSize: 12,
              cursor: ingredients.length === 1 ? "not-allowed" : "pointer",
              padding: "4px 0",
            }}
          >
            ✕
          </button>
        </div>
      ))}

      <FormRow label="Tags" hint="freeform recipe tags — classic / equal-parts / aperitivo / house-favorite / etc.">
        <div
          style={{
            padding: 8,
            background: T.surface2,
            border: `1px solid ${T.hairline2}`,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {tags.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {tags.map((t, i) => (
                <span
                  key={t}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "3px 6px 3px 8px",
                    background: T.bg,
                    border: `1px solid ${T.hairline2}`,
                    fontFamily: T.mono,
                    fontSize: 11,
                    color: T.ink,
                  }}
                >
                  {t}
                  <button
                    type="button"
                    onClick={() => removeTag(i)}
                    aria-label={`remove ${t}`}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: T.inkMuted,
                      fontFamily: T.mono,
                      fontSize: 12,
                      cursor: "pointer",
                      padding: "0 2px",
                    }}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 60px", gap: 6 }}>
            <FormInput
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag();
                }
              }}
              placeholder="classic / aperitivo / equal-parts / …"
            />
            <button
              type="button"
              onClick={addTag}
              disabled={!tagInput.trim()}
              style={{
                background: tagInput.trim() ? T.cyan : T.surface,
                color: tagInput.trim() ? T.bg : T.inkMuted,
                border: "none",
                fontFamily: T.mono,
                fontSize: 11,
                letterSpacing: "0.12em",
                cursor: tagInput.trim() ? "pointer" : "not-allowed",
              }}
            >
              ADD
            </button>
          </div>
        </div>
      </FormRow>

      <FormRow label="Publish" hint="published recipes appear on the guest menu when makeable">
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={isPublished}
            onChange={(e) => setIsPublished(e.target.checked)}
            style={{ accentColor: T.cyan }}
          />
          <span style={{ fontSize: 12, color: T.ink }}>publish on save</span>
        </label>
      </FormRow>
    </FormShell>
  );
}

/** Compact toggle button used for OPT / GARN flags on each ingredient row. */
function FlagToggle({
  label,
  on,
  title,
  onClick,
}: {
  label: string;
  on: boolean;
  title: string;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        padding: "4px 0",
        background: on ? T.cyan : "transparent",
        color: on ? T.bg : T.inkMuted,
        border: `1px solid ${on ? T.cyan : T.hairline2}`,
        fontFamily: T.mono,
        fontSize: 9,
        fontWeight: 600,
        letterSpacing: "0.1em",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}
