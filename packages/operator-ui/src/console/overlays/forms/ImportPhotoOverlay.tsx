/**
 * Import Recipe from Photo — POST /recipes/import-photo (vision endpoint).
 *
 * File pick → read as base64 → POST → server returns a draft IdeateSpec
 * + list of unresolved ingredient labels. Operator can scan, then SAVE
 * (POST /recipes) or discard.
 */
import { useState } from "react";
import { api, type ImportedRecipeDraft, type RecipePhotoImportResponse } from "../../../api/client";
import { store } from "../../../store/useStore";
import { T } from "../../tokens";
import { FormShell, toSlug } from "./FormShell";

interface Props {
  onClose(): void;
  onToast?(text: string): void;
}

type State =
  | { kind: "pick" }
  | { kind: "uploading" }
  | { kind: "draft"; result: RecipePhotoImportResponse }
  | { kind: "saving" }
  | { kind: "saved" };

export function ImportPhotoOverlay({ onClose, onToast }: Props) {
  const [state, setState] = useState<State>({ kind: "pick" });
  const [error, setError] = useState<string | null>(null);

  const pickFile = async (file: File) => {
    setError(null);
    setState({ kind: "uploading" });
    try {
      const b64 = await readAsBase64(file);
      const result = await api.importRecipePhoto({ image_b64: b64, media_type: file.type || "image/jpeg" });
      setState({ kind: "draft", result });
    } catch (e) {
      setError(e instanceof Error ? e.message : "import failed");
      setState({ kind: "pick" });
    }
  };

  const saveDraft = async (draft: ImportedRecipeDraft) => {
    setState({ kind: "saving" });
    setError(null);
    try {
      const slug = toSlug(draft.name);
      // Photo-import emits raw labels (no catalog binding) — write them as
      // `freeform` refs. The operator binds to real products afterward.
      await api.createRecipe({
        id: slug,
        name: draft.name,
        family: draft.family,
        method: draft.method,
        glass: draft.glass,
        ice: draft.ice,
        garnish: draft.garnish,
        instructions: draft.instructions,
        source: "photo-import",
        is_published: false,
        tags: [],
        ingredients: (draft.ingredients ?? []).map((ing, i) => ({
          ref_type: "freeform",
          ref_id: ing.label,
          label: ing.label,
          amount: ing.amount,
          unit: ing.unit ?? "ml",
          optional: false,
          garnish: false,
          sort: i,
        })),
      });
      await store.hydrate();
      onToast?.(`imported · ${draft.name}`);
      setState({ kind: "saved" });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "save failed");
      // fall back to the draft view so operator can fix + retry
      setState((prev) =>
        prev.kind === "saving"
          ? { kind: "draft", result: { draft, unresolved: [], image_hash: "" } }
          : prev,
      );
    }
  };

  const submit = () => {
    if (state.kind === "draft") void saveDraft(state.result.draft);
  };

  return (
    <FormShell
      title="Import recipe from photo"
      subtitle="Vision-extract a recipe spec from a book page or printout. Result is a draft — no auto-save."
      onClose={onClose}
      onSubmit={submit}
      submitLabel={state.kind === "draft" ? "✓ SAVE AS RECIPE" : "PICK A PHOTO FIRST"}
      submitDisabled={state.kind !== "draft"}
      submitting={state.kind === "saving"}
      error={error}
      width={640}
    >
      {state.kind === "pick" ? (
        <label
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "40px 20px",
            border: `1px dashed ${T.hairline2}`,
            background: T.surface2,
            cursor: "pointer",
            gap: 8,
          }}
        >
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void pickFile(f);
            }}
            style={{ display: "none" }}
          />
          <div style={{ fontSize: 32, color: T.inkMuted }}>📷</div>
          <div style={{ fontSize: 14, color: T.ink, fontWeight: 500 }}>Click to pick a photo</div>
          <div style={{ fontSize: 11, color: T.inkMuted, fontFamily: T.mono, textAlign: "center", lineHeight: 1.5 }}>
            JPG, PNG, HEIC · book page, menu print, your own scribble
            <br />
            sent to the AI gateway; nothing else stored
          </div>
        </label>
      ) : null}

      {state.kind === "uploading" ? (
        <div style={{ padding: 40, fontSize: 13, color: T.inkMuted, fontFamily: T.mono, textAlign: "center" }}>
          extracting…
        </div>
      ) : null}

      {state.kind === "draft" ? <DraftPreview result={state.result} /> : null}
    </FormShell>
  );
}

function DraftPreview({ result }: { result: RecipePhotoImportResponse }) {
  const { draft, unresolved } = result;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ padding: "10px 12px", background: T.surface2, border: `1px solid ${T.hairline2}` }}>
        <div style={{ fontSize: 10, fontFamily: T.mono, color: T.cyan, letterSpacing: "0.18em" }}>DRAFT</div>
        <div style={{ fontSize: 18, fontWeight: 500, color: T.ink, marginTop: 2 }}>{draft.name}</div>
        <div style={{ fontFamily: T.mono, fontSize: 10, color: T.inkDim, marginTop: 4 }}>
          {draft.family ?? "—"} · {draft.method ?? "—"} · {draft.glass ?? "—"}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {draft.ingredients.map((ing, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 8,
              padding: "4px 0",
              borderBottom: `1px solid ${T.hairline}`,
              fontSize: 12,
            }}
          >
            <span style={{ color: T.cyan, fontFamily: T.mono, fontSize: 9, width: 20 }}>
              {String(i + 1).padStart(2, "0")}
            </span>
            <span style={{ flex: 1, color: T.ink }}>{ing.label}</span>
            <span style={{ fontFamily: T.mono, fontSize: 10, color: T.inkMuted }}>
              {ing.amount != null ? `${ing.amount} ${ing.unit ?? ""}` : "—"}
            </span>
          </div>
        ))}
      </div>

      {unresolved.length > 0 ? (
        <div
          style={{
            padding: "8px 10px",
            fontSize: 11,
            color: T.amber,
            background: T.amberGlow,
            border: `1px solid ${T.amberDim}`,
            fontFamily: T.mono,
            lineHeight: 1.5,
          }}
        >
          ⚠ {unresolved.length} unresolved label{unresolved.length === 1 ? "" : "s"}:{" "}
          {unresolved.join(", ")}
          <br />
          Add the missing products to the catalog and edit the recipe after save to re-bind.
        </div>
      ) : null}
    </div>
  );
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      // strip "data:image/png;base64,"
      const i = dataUrl.indexOf(",");
      resolve(i >= 0 ? dataUrl.slice(i + 1) : dataUrl);
    };
    reader.onerror = () => reject(reader.error ?? new Error("file read failed"));
    reader.readAsDataURL(file);
  });
}
