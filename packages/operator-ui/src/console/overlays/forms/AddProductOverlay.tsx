/**
 * Add Product — POST /products + ✦ AI LOOKUP (POST /ai/product-lookup).
 *
 * Flow:
 *   1. Type the product name → ✦ AI LOOKUP fetches structured metadata via
 *      Haiku 4.5 (distillery, origin, ABV, flavor + namespaced tags).
 *   2. Form fields populate with cyan "AI suggested" indicators; operator
 *      confirms/edits before submit.
 *   3. POST /products writes the catalog row + tags atomically.
 *
 * Per specs/inventory-model.md §3a + §3b. Tags use the namespaced taxonomy
 * (smugglers-cove, cocktail-codex, flavor, operator).
 */
import { useMemo, useState } from "react";
import type { Product } from "@backbar/core";
import { api, type ProductLookupResult, type ProductTagRow } from "../../../api/client";
import { store, useStore } from "../../../store/useStore";
import { ConSelect } from "../../Select";
import { T } from "../../tokens";
import { FormInput, FormRow, FormShell, FormTextarea, toSlug } from "./FormShell";

export type ProductOverlayMode = "create" | "edit" | "duplicate";

interface Props {
  onClose(): void;
  onToast?(text: string): void;
  /** Render mode — create/edit/duplicate. Defaults to "create". */
  mode?: ProductOverlayMode;
  /** Source product for edit/duplicate — required when mode != 'create'. */
  initial?: Product & { tags?: ProductTagRow[] };
}

/** Track which fields got auto-filled vs operator-typed — drives the "AI" chip. */
type Suggested = Set<keyof FormState>;

interface FormState {
  id: string;
  name: string;
  category: string;
  subcategory: string;
  abv: string;
  distillery: string;
  origin_country: string;
  origin_region: string;
  age_statement_y: string;
  flavor_tags: string;       // comma-separated, free-form
  tags: ProductTagRow[];     // namespaced taxonomy
  notes: string;
}

const EMPTY: FormState = {
  id: "",
  name: "",
  category: "spirit",
  subcategory: "",
  abv: "",
  distillery: "",
  origin_country: "",
  origin_region: "",
  age_statement_y: "",
  flavor_tags: "",
  tags: [],
  notes: "",
};

const COMMON_NAMESPACES = ["smugglers-cove", "cocktail-codex", "flavor", "operator"];

export function AddProductOverlay({ onClose, onToast, mode = "create", initial }: Props) {
  const seed = useMemo<FormState>(() => initialForm(mode, initial), [mode, initial]);
  const [form, setForm] = useState<FormState>(seed);
  const categoryRegistry = useStore((s) => s.categories);
  // Edit mode locks the slug; duplicate seeds a fresh slug from the source
  // name and treats it as user-touched so AI lookup doesn't overwrite it.
  const [idTouched, setIdTouched] = useState(mode !== "create");
  const [suggested, setSuggested] = useState<Suggested>(new Set());
  const [aiState, setAiState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiHint, setAiHint] = useState<{ confidence: string; rationale: string | null } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = mode === "edit";
  const isDuplicate = mode === "duplicate";

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    // Operator-edit clears the "suggested" marker for that field
    setSuggested((s) => {
      if (!s.has(key)) return s;
      const next = new Set(s);
      next.delete(key);
      return next;
    });
  };

  const onName = (s: string) => {
    update("name", s);
    if (!idTouched) update("id", toSlug(s));
  };

  const runAiLookup = async () => {
    if (!form.name.trim()) {
      setAiError("enter a product name first");
      return;
    }
    setAiState("loading");
    setAiError(null);
    try {
      const env = await api.lookupProduct({ name: form.name.trim() });
      applyAi(env.result);
      setAiHint({ confidence: env.result.confidence, rationale: env.result.rationale });
      setAiState("ok");
    } catch (e) {
      setAiState("error");
      setAiError(e instanceof Error ? e.message : "lookup failed");
    }
  };

  /** Merge AI suggestions into the form, marking each touched field as "suggested". */
  const applyAi = (r: ProductLookupResult) => {
    const next: Partial<FormState> = {};
    const marked: Suggested = new Set();
    const setIf = <K extends keyof FormState>(key: K, value: FormState[K] | null | undefined) => {
      if (value == null) return;
      // Don't clobber operator's own typed values (id when they've manually edited it)
      if (key === "id" && idTouched) return;
      next[key] = value;
      marked.add(key);
    };

    setIf("name", r.name);
    if (!idTouched) {
      next.id = r.suggested_id || toSlug(r.name);
      marked.add("id");
    }
    setIf("category", r.category);
    setIf("subcategory", r.subcategory ?? "");
    setIf("abv", r.abv != null ? r.abv.toFixed(2) : "");
    setIf("distillery", r.distillery ?? "");
    setIf("origin_country", r.origin_country ?? "");
    setIf("origin_region", r.origin_region ?? "");
    setIf("age_statement_y", r.age_statement_y != null ? String(r.age_statement_y) : "");
    setIf("flavor_tags", r.flavor_tags.join(", "));
    setIf("notes", r.notes ?? "");
    if (r.tags.length > 0) {
      next.tags = r.tags;
      marked.add("tags");
    }
    setForm((f) => ({ ...f, ...next }));
    setSuggested(marked);
  };

  const submit = async () => {
    if (!form.id || !form.name) {
      setError("id and name are required");
      return;
    }
    const abv = form.abv.trim() === "" ? null : Number.parseFloat(form.abv);
    if (abv != null && (!Number.isFinite(abv) || abv < 0 || abv > 1)) {
      setError("ABV must be 0–1 (e.g. 0.40 for 40%)");
      return;
    }
    const age = form.age_statement_y.trim() === "" ? null : Number.parseFloat(form.age_statement_y);
    if (age != null && (!Number.isFinite(age) || age <= 0)) {
      setError("age must be a positive number of years");
      return;
    }
    const flavorTags = form.flavor_tags
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const productPayload = {
      id: form.id,
      name: form.name,
      category: form.category,
      subcategory: form.subcategory.trim() || null,
      abv,
      distillery: form.distillery.trim() || null,
      origin_country: form.origin_country.trim().toUpperCase() || null,
      origin_region: form.origin_region.trim() || null,
      age_statement_y: age,
      flavor_tags: flavorTags,
      notes: form.notes.trim() || null,
    };

    setSubmitting(true);
    setError(null);
    try {
      if (isEdit) {
        // Edit — PATCH product fields, then PUT tags wholesale so removals
        // from the editor actually take effect.
        await api.patchProduct(form.id, productPayload);
        await api.replaceProductTags(form.id, form.tags);
        onToast?.(`updated · ${form.name}`);
      } else {
        // Create or duplicate — POST with tags inline.
        await api.createProduct({ ...productPayload, tags: form.tags });
        onToast?.(isDuplicate ? `duplicated → ${form.name}` : `added product · ${form.name}`);
      }
      await store.hydrate();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "save failed");
    } finally {
      setSubmitting(false);
    }
  };

  const title = isEdit ? `Edit · ${initial?.name ?? form.name}` : isDuplicate ? "Duplicate product" : "Add product";
  const subtitle = isEdit
    ? "Edit catalog metadata + tags. ID is fixed; create a new product or duplicate if you need a different slug."
    : isDuplicate
      ? "Fresh ID, prefilled from the source. Change name + metadata as needed before save."
      : "New SKU in the catalog. ✦ AI LOOKUP pre-fills metadata you can edit before save.";

  return (
    <FormShell
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      onSubmit={() => void submit()}
      submitting={submitting}
      submitDisabled={!form.id || !form.name}
      submitLabel={isEdit ? "✓ SAVE CHANGES" : isDuplicate ? "✓ CREATE DUPLICATE" : "✓ SAVE"}
      error={error}
      width={720}
    >
      {/* AI lookup row — sits above the form */}
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "stretch",
          padding: "10px 12px",
          background: aiState === "ok" ? T.cyanGlow : T.surface2,
          border: `1px solid ${aiState === "ok" ? T.cyan : T.hairline2}`,
        }}
      >
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
          <FormInput
            value={form.name}
            onChange={(e) => onName(e.target.value)}
            placeholder="Buffalo Trace · Carpano Antica · Planteray OFTD · …"
            autoFocus
          />
          {aiHint ? (
            <div style={{ fontSize: 10, color: T.inkMuted, fontFamily: T.mono }}>
              <span style={{ color: aiHint.confidence === "high" ? T.green : aiHint.confidence === "low" ? T.amber : T.cyan }}>
                ✦ {aiHint.confidence.toUpperCase()} CONFIDENCE
              </span>
              {aiHint.rationale ? ` · ${aiHint.rationale}` : ""}
            </div>
          ) : (
            <div style={{ fontSize: 10, color: T.inkDim, fontFamily: T.mono }}>
              type a name then click ✦ to pre-fill the form
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => void runAiLookup()}
          disabled={aiState === "loading" || !form.name.trim()}
          style={{
            padding: "0 16px",
            background: aiState === "loading" ? T.surface : T.cyan,
            color: aiState === "loading" ? T.inkMuted : T.bg,
            border: "none",
            fontFamily: T.mono,
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.14em",
            cursor: aiState === "loading" || !form.name.trim() ? "not-allowed" : "pointer",
            minWidth: 140,
          }}
        >
          {aiState === "loading" ? "LOOKING…" : aiState === "ok" ? "✦ AGAIN" : "✦ AI LOOKUP"}
        </button>
      </div>
      {aiError ? (
        <div style={{ fontSize: 10, color: T.amber, fontFamily: T.mono, marginTop: -6 }}>⚠ {aiError}</div>
      ) : null}

      <FormRow
        label="ID (slug)"
        hint={
          isEdit
            ? "fixed on existing rows — duplicate the product if you need a different slug"
            : "lowercase, kebab-case · auto-fills from name"
        }
      >
        <FieldShell suggested={suggested.has("id")}>
          <FormInput
            value={form.id}
            disabled={isEdit}
            onChange={(e) => {
              setIdTouched(true);
              update("id", toSlug(e.target.value));
            }}
            placeholder="buffalo-trace"
          />
        </FieldShell>
      </FormRow>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <FormRow label="Category">
          <FieldShell suggested={suggested.has("category")}>
            <ConSelect
              value={form.category}
              options={categoryRegistry.map((c) => ({ value: c.id, label: c.label, hint: c.id }))}
              onChange={(v) => update("category", v)}
            />
          </FieldShell>
        </FormRow>
        <FormRow label="Subcategory" hint="optional · e.g. kentucky-straight">
          <FieldShell suggested={suggested.has("subcategory")}>
            <FormInput
              value={form.subcategory}
              onChange={(e) => update("subcategory", e.target.value)}
              placeholder="kentucky-straight"
            />
          </FieldShell>
        </FormRow>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        <FormRow label="ABV" hint="0–1 (e.g. 0.40)">
          <FieldShell suggested={suggested.has("abv")}>
            <FormInput
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={form.abv}
              onChange={(e) => update("abv", e.target.value)}
              placeholder="0.40"
            />
          </FieldShell>
        </FormRow>
        <FormRow label="Age (yrs)" hint="optional · NAS = blank">
          <FieldShell suggested={suggested.has("age_statement_y")}>
            <FormInput
              type="number"
              step="1"
              min="0"
              value={form.age_statement_y}
              onChange={(e) => update("age_statement_y", e.target.value)}
              placeholder="12"
            />
          </FieldShell>
        </FormRow>
        <FormRow label="Distillery">
          <FieldShell suggested={suggested.has("distillery")}>
            <FormInput
              value={form.distillery}
              onChange={(e) => update("distillery", e.target.value)}
              placeholder="Buffalo Trace Distillery"
            />
          </FieldShell>
        </FormRow>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 10 }}>
        <FormRow label="Country" hint="ISO-2 (US, BB, MX, …)">
          <FieldShell suggested={suggested.has("origin_country")}>
            <FormInput
              value={form.origin_country}
              maxLength={2}
              onChange={(e) => update("origin_country", e.target.value.toUpperCase())}
              placeholder="US"
              style={{ textTransform: "uppercase" }}
            />
          </FieldShell>
        </FormRow>
        <FormRow label="Region">
          <FieldShell suggested={suggested.has("origin_region")}>
            <FormInput
              value={form.origin_region}
              onChange={(e) => update("origin_region", e.target.value)}
              placeholder="Kentucky · Barbados · Oaxaca"
            />
          </FieldShell>
        </FormRow>
      </div>

      <FormRow label="Flavor tags" hint="freeform, comma-separated · e.g. vanilla, smoky, herbal">
        <FieldShell suggested={suggested.has("flavor_tags")}>
          <FormInput
            value={form.flavor_tags}
            onChange={(e) => update("flavor_tags", e.target.value)}
            placeholder="vanilla, caramel, oak"
          />
        </FieldShell>
      </FormRow>

      <TagEditor
        tags={form.tags}
        suggested={suggested.has("tags")}
        onChange={(tags) => {
          setForm((f) => ({ ...f, tags }));
          setSuggested((s) => {
            const n = new Set(s);
            n.delete("tags");
            return n;
          });
        }}
      />

      <FormRow label="Notes" hint="optional · tasting notes, provenance">
        <FieldShell suggested={suggested.has("notes")}>
          <FormTextarea rows={2} value={form.notes} onChange={(e) => update("notes", e.target.value)} />
        </FieldShell>
      </FormRow>
    </FormShell>
  );
}

/**
 * Build initial form state for the chosen mode:
 *   create    → empty form, slug auto-fills from name
 *   edit      → all fields prefilled from `initial`, slug locked
 *   duplicate → prefilled with a "-copy" slug suggestion so save doesn't 409
 */
function initialForm(
  mode: ProductOverlayMode,
  initial?: Product & { tags?: ProductTagRow[] },
): FormState {
  if (mode === "create" || !initial) return EMPTY;
  const duplicateSlug = mode === "duplicate" ? `${initial.id}-copy` : initial.id;
  return {
    id: duplicateSlug,
    name: mode === "duplicate" ? `${initial.name} (copy)` : initial.name,
    category: initial.category,
    subcategory: initial.subcategory ?? "",
    abv: initial.abv != null ? String(initial.abv) : "",
    distillery: initial.distillery ?? "",
    origin_country: initial.origin_country ?? "",
    origin_region: initial.origin_region ?? "",
    age_statement_y: initial.age_statement_y != null ? String(initial.age_statement_y) : "",
    flavor_tags: (initial.flavor_tags ?? []).join(", "),
    tags: initial.tags ? initial.tags.map((t) => ({ namespace: t.namespace, value: t.value })) : [],
    notes: initial.notes ?? "",
  };
}

/** Wraps a form field with a thin cyan accent when the value came from AI. */
function FieldShell({ children, suggested }: { children: React.ReactNode; suggested: boolean }) {
  return (
    <div style={{ position: "relative" }}>
      {children}
      {suggested ? (
        <span
          title="suggested by AI — edit to override"
          style={{
            position: "absolute",
            top: -8,
            right: 4,
            fontSize: 8,
            fontFamily: "ui-monospace, monospace",
            color: T.bg,
            background: T.cyan,
            padding: "1px 5px",
            letterSpacing: "0.14em",
            pointerEvents: "none",
          }}
        >
          ✦ AI
        </span>
      ) : null}
    </div>
  );
}

/** Tag editor — add/remove namespaced tags (smugglers-cove:column-still-rum). */
function TagEditor({
  tags,
  suggested,
  onChange,
}: {
  tags: ProductTagRow[];
  suggested: boolean;
  onChange(tags: ProductTagRow[]): void;
}) {
  const [namespace, setNamespace] = useState("operator");
  const [value, setValue] = useState("");

  const add = () => {
    const v = value.trim();
    if (!v) return;
    if (tags.some((t) => t.namespace === namespace && t.value === v)) return;
    onChange([...tags, { namespace, value: v }]);
    setValue("");
  };

  const remove = (i: number) => {
    onChange(tags.filter((_, j) => j !== i));
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 10, color: T.inkMuted, letterSpacing: "0.14em" }}>
          NAMESPACED TAGS{suggested ? " ✦" : ""}
        </span>
        <span style={{ fontSize: 9, color: T.inkDim, fontFamily: T.mono }}>
          {tags.length} {tags.length === 1 ? "tag" : "tags"}
        </span>
      </div>
      <div
        style={{
          padding: 8,
          background: T.surface2,
          border: `1px solid ${suggested ? T.cyan : T.hairline2}`,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {tags.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {tags.map((t, i) => (
              <span
                key={`${t.namespace}/${t.value}`}
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
                <span style={{ color: T.cyan }}>{t.namespace}</span>
                <span style={{ color: T.inkDim }}>:</span>
                <span>{t.value}</span>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  aria-label={`remove ${t.namespace}:${t.value}`}
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
        <div style={{ display: "grid", gridTemplateColumns: "160px 1fr 60px", gap: 6, alignItems: "stretch" }}>
          <ConSelect
            value={namespace}
            options={COMMON_NAMESPACES}
            onChange={(v) => setNamespace(v)}
          />
          <FormInput
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder={
              namespace === "smugglers-cove"
                ? "column-still-rum / pot-still-rum / …"
                : namespace === "cocktail-codex"
                  ? "old-fashioned-root / manhattan-root / …"
                  : "value"
            }
          />
          <button
            type="button"
            onClick={add}
            disabled={!value.trim()}
            style={{
              background: value.trim() ? T.cyan : T.surface,
              color: value.trim() ? T.bg : T.inkMuted,
              border: "none",
              fontFamily: T.mono,
              fontSize: 11,
              letterSpacing: "0.12em",
              cursor: value.trim() ? "pointer" : "not-allowed",
            }}
          >
            ADD
          </button>
        </div>
      </div>
    </div>
  );
}
