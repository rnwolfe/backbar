/**
 * Bulk Import Inventory from Photos.
 *
 * Flow:
 *   1. Pick — drag-drop or click to select multiple shelf photos
 *   2. Processing — POST /inventory/import-photo-bulk (vision + grounding)
 *   3. Review — one editable row per detected bottle; operator can discard
 *   4. Commit — writes only confirmed candidates; nothing persisted before this
 *
 * Mobile-first: FormShell goes full-screen at < 768px.
 * Reflows at 375px: all candidate fields stack vertically, touch targets ≥ 44px.
 */
import { useRef, useState } from "react";
import {
  api,
  type BulkImportCandidate,
  type BulkImportPerImage,
} from "../../../api/client";
import { store } from "../../../store/useStore";
import { ConSelect } from "../../Select";
import { T } from "../../tokens";
import { FormInput, FormShell, toSlug } from "./FormShell";

// ── fill helpers ────────────────────────────────────────────────────────────

type FillLevel = "full" | "three-quarter" | "half" | "quarter" | "empty" | "";

const FILL_OPTIONS: { value: FillLevel; label: string }[] = [
  { value: "full", label: "Full (100%)" },
  { value: "three-quarter", label: "¾ (75%)" },
  { value: "half", label: "½ (50%)" },
  { value: "quarter", label: "¼ (25%)" },
  { value: "empty", label: "Nearly empty" },
  { value: "", label: "Unknown" },
];

function fillToMl(fill: FillLevel, fullMl: number): number {
  const fracs: Record<Exclude<FillLevel, "">, number> = {
    full: 1.0,
    "three-quarter": 0.75,
    half: 0.5,
    quarter: 0.25,
    empty: 0.05,
  };
  return Math.round(fullMl * (fill ? fracs[fill] : 0.75));
}

// ── editable candidate state ─────────────────────────────────────────────────

interface EditableCandidate {
  _key: string;
  raw: BulkImportCandidate;
  discarded: boolean;
  name: string;
  expression: string;
  fill: FillLevel;
  category: string;
  sizeMl: string;
  abvPct: string;
  brand: string;
}

function toEditable(c: BulkImportCandidate, idx: number): EditableCandidate {
  return {
    _key: `${c.image_index}-${idx}`,
    raw: c,
    // Pre-skip candidates that would duplicate a product you already have an
    // open bottle of — the operator opts back in if it's a genuinely new bottle.
    discarded: (c.existing_open_bottles ?? 0) > 0,
    name: c.display_name,
    expression: c.expression ?? "",
    fill: (c.fill_observed as FillLevel) ?? "",
    category: c.category ?? "",
    sizeMl: c.size_ml != null ? String(c.size_ml) : "750",
    abvPct: c.abv != null ? String(Math.round(c.abv * 1000) / 10) : "",
    brand: c.brand ?? "",
  };
}

// ── phase types ──────────────────────────────────────────────────────────────

type Phase =
  | { kind: "pick"; files: File[] }
  | { kind: "processing"; imageCount: number }
  | { kind: "review"; candidates: EditableCandidate[]; perImage: BulkImportPerImage[] }
  | { kind: "committing" };

// ── base64 helper ────────────────────────────────────────────────────────────

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const i = dataUrl.indexOf(",");
      resolve(i >= 0 ? dataUrl.slice(i + 1) : dataUrl);
    };
    reader.onerror = () => reject(reader.error ?? new Error("file read failed"));
    reader.readAsDataURL(file);
  });
}

// ── main component ────────────────────────────────────────────────────────────

interface Props {
  onClose(): void;
  onToast?(text: string): void;
}

export function BulkImportInventoryOverlay({ onClose, onToast }: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: "pick", files: [] });
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = (incoming: File[]) => {
    if (phase.kind !== "pick") return;
    const next = [...phase.files];
    for (const f of incoming) {
      if (!next.some((x) => x.name === f.name && x.size === f.size)) next.push(f);
    }
    setPhase({ kind: "pick", files: next });
  };

  const removeFile = (idx: number) => {
    if (phase.kind !== "pick") return;
    setPhase({ kind: "pick", files: phase.files.filter((_, i) => i !== idx) });
  };

  const processFiles = async () => {
    if (phase.kind !== "pick" || phase.files.length === 0) return;
    const files = phase.files;
    setError(null);
    setPhase({ kind: "processing", imageCount: files.length });
    try {
      const images = await Promise.all(
        files.map(async (f) => ({
          image_b64: await readAsBase64(f),
          media_type: f.type || "image/jpeg",
          id: f.name,
        })),
      );
      const result = await api.importInventoryPhotoBulk({ images });
      const candidates = result.candidates.map((c, i) => toEditable(c, i));
      setPhase({ kind: "review", candidates, perImage: result.per_image });
    } catch (e) {
      setError(e instanceof Error ? e.message : "import failed");
      setPhase({ kind: "pick", files });
    }
  };

  const patchCandidate = (key: string, patch: Partial<Omit<EditableCandidate, "_key" | "raw">>) => {
    setPhase((prev) => {
      if (prev.kind !== "review") return prev;
      return {
        ...prev,
        candidates: prev.candidates.map((c) => (c._key === key ? { ...c, ...patch } : c)),
      };
    });
  };

  const commitAll = async () => {
    if (phase.kind !== "review") return;
    const toCommit = phase.candidates.filter((c) => !c.discarded);
    if (!toCommit.length) {
      onClose();
      return;
    }
    setPhase({ kind: "committing" });
    setError(null);
    let ok = 0;
    let fail = 0;
    for (const c of toCommit) {
      try {
        const full_ml = Math.round(Number.parseFloat(c.sizeMl)) || 750;
        const level_ml = fillToMl(c.fill, full_ml);
        let product_id: string;

        if (c.raw.reconciliation === "existing-product" && c.raw.matched_product_id) {
          product_id = c.raw.matched_product_id;
        } else {
          const id = toSlug(c.name) || `import-${ok + fail}`;
          const abvNum = c.abvPct.trim() ? Number.parseFloat(c.abvPct) / 100 : null;
          await api.createProduct({
            id,
            name: c.name,
            category: c.category || "spirits",
            subcategory: null,
            abv: abvNum != null && Number.isFinite(abvNum) ? abvNum : null,
            distillery: c.brand.trim() || null,
            origin_country: c.raw.origin_country || null,
            origin_region: null,
            age_statement_y: null,
            flavor_tags: [],
            notes: null,
            tags: [],
          });
          product_id = id;
        }

        const created = await api.createBottle({
          product_id,
          full_ml,
          level_ml,
          status: "open",
          tracked: false,
          slot: null,
        });
        if (c.fill !== "") {
          await api.ingestManualReading({ bottle_id: created.id, level_ml });
        }
        ok++;
      } catch {
        fail++;
      }
    }

    await store.hydrate();
    const msg =
      fail > 0
        ? `imported ${ok} bottle${ok !== 1 ? "s" : ""} · ${fail} failed`
        : `imported ${ok} bottle${ok !== 1 ? "s" : ""}`;
    onToast?.(msg);
    onClose();
  };

  const activeCount = phase.kind === "review" ? phase.candidates.filter((c) => !c.discarded).length : 0;

  const submitLabel = (() => {
    if (phase.kind === "pick")
      return phase.files.length === 0
        ? "PICK PHOTOS FIRST"
        : `PROCESS ${phase.files.length} PHOTO${phase.files.length !== 1 ? "S" : ""}`;
    if (phase.kind === "processing") return "PROCESSING…";
    if (phase.kind === "review")
      return activeCount > 0
        ? `COMMIT ${activeCount} BOTTLE${activeCount !== 1 ? "S" : ""}`
        : "NOTHING TO COMMIT";
    if (phase.kind === "committing") return "COMMITTING…";
    return "DONE";
  })();

  const submitDisabled =
    (phase.kind === "pick" && phase.files.length === 0) ||
    phase.kind === "processing" ||
    phase.kind === "committing";

  const onSubmit = () => {
    if (phase.kind === "pick") void processFiles();
    else if (phase.kind === "review") void commitAll();
  };

  return (
    <FormShell
      title="Import inventory from photos"
      subtitle="Drop shelf photos — AI detects bottles, grounds metadata. Review and edit before committing."
      onClose={onClose}
      onSubmit={onSubmit}
      submitLabel={submitLabel}
      submitDisabled={submitDisabled}
      submitting={phase.kind === "processing" || phase.kind === "committing"}
      error={error}
      width={720}
    >
      {phase.kind === "pick" ? (
        <PickPhase
          files={phase.files}
          dragActive={dragActive}
          setDragActive={setDragActive}
          addFiles={addFiles}
          removeFile={removeFile}
          fileInputRef={fileInputRef}
        />
      ) : null}

      {phase.kind === "processing" ? (
        <div
          style={{
            padding: "48px 0",
            textAlign: "center",
            fontFamily: T.mono,
            fontSize: 13,
            color: T.inkMuted,
          }}
        >
          detecting bottles in {phase.imageCount} image{phase.imageCount !== 1 ? "s" : ""}…
          <br />
          <span style={{ fontSize: 11, color: T.inkDim, marginTop: 4, display: "block" }}>
            vision extraction + grounding — takes 10–30 s
          </span>
        </div>
      ) : null}

      {phase.kind === "review" ? (
        <ReviewPhase
          candidates={phase.candidates}
          perImage={phase.perImage}
          patchCandidate={patchCandidate}
        />
      ) : null}

      {phase.kind === "committing" ? (
        <div
          style={{
            padding: "48px 0",
            textAlign: "center",
            fontFamily: T.mono,
            fontSize: 13,
            color: T.inkMuted,
          }}
        >
          writing to catalog…
        </div>
      ) : null}
    </FormShell>
  );
}

// ── Pick phase ───────────────────────────────────────────────────────────────

function PickPhase({
  files,
  dragActive,
  setDragActive,
  addFiles,
  removeFile,
  fileInputRef,
}: {
  files: File[];
  dragActive: boolean;
  setDragActive(v: boolean): void;
  addFiles(files: File[]): void;
  removeFile(idx: number): void;
  fileInputRef: React.RefObject<HTMLInputElement>;
}) {
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragActive(false);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const dropped = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
    if (dropped.length) addFiles(dropped);
  };

  const fmtSize = (n: number) =>
    n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Drop zone */}
      <label
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "32px 20px",
          border: `1px dashed ${dragActive ? T.cyan : T.hairline2}`,
          background: dragActive ? T.cyanGlow : T.surface2,
          cursor: "pointer",
          gap: 8,
          transition: "border-color 0.15s, background 0.15s",
          minHeight: 120,
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => {
            const f = Array.from(e.target.files ?? []);
            if (f.length) addFiles(f);
            e.target.value = "";
          }}
          style={{ display: "none" }}
        />
        <div style={{ fontSize: 28, color: dragActive ? T.cyan : T.inkMuted }}>📷</div>
        <div style={{ fontSize: 13, color: T.ink, fontWeight: 500 }}>
          {dragActive ? "Drop photos here" : "Click or drag-and-drop photos"}
        </div>
        <div
          style={{
            fontSize: 11,
            color: T.inkMuted,
            fontFamily: T.mono,
            textAlign: "center",
            lineHeight: 1.5,
          }}
        >
          JPG, PNG, HEIC, WEBP · up to 20 images · shelf photos work best
          <br />
          sent to AI gateway for bottle detection — not stored
        </div>
      </label>

      {/* File list */}
      {files.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: 10, color: T.inkMuted, letterSpacing: "0.14em" }}>
            {files.length} PHOTO{files.length !== 1 ? "S" : ""} QUEUED
          </div>
          {files.map((f, i) => (
            <div
              key={`${f.name}-${f.size}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 10px",
                background: T.surface2,
                border: `1px solid ${T.hairline}`,
                fontSize: 12,
              }}
            >
              <span style={{ flex: 1, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {f.name}
              </span>
              <span style={{ fontFamily: T.mono, fontSize: 10, color: T.inkDim, flexShrink: 0 }}>
                {fmtSize(f.size)}
              </span>
              <button
                type="button"
                onClick={() => removeFile(i)}
                aria-label={`remove ${f.name}`}
                style={{
                  background: "transparent",
                  border: `1px solid ${T.hairline2}`,
                  color: T.inkMuted,
                  fontFamily: T.mono,
                  fontSize: 12,
                  width: 24,
                  height: 24,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ── Review phase ─────────────────────────────────────────────────────────────

function ReviewPhase({
  candidates,
  perImage,
  patchCandidate,
}: {
  candidates: EditableCandidate[];
  perImage: BulkImportPerImage[];
  patchCandidate(key: string, patch: Partial<Omit<EditableCandidate, "_key" | "raw">>): void;
}) {
  const failed = perImage.filter((p) => p.status === "failed");
  const activeCount = candidates.filter((c) => !c.discarded).length;

  if (candidates.length === 0) {
    return (
      <div
        style={{
          padding: "32px 0",
          textAlign: "center",
          fontFamily: T.mono,
          fontSize: 13,
          color: T.inkMuted,
        }}
      >
        No bottles detected in the uploaded photos.
        <br />
        <span style={{ fontSize: 11, color: T.inkDim, marginTop: 4, display: "block" }}>
          Try a clearer photo with labels facing forward.
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* Per-image failure warnings */}
      {failed.length > 0 ? (
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
          ⚠ {failed.length} image{failed.length !== 1 ? "s" : ""} failed detection:{" "}
          {failed.map((f) => f.image_id ?? `image ${f.image_index}`).join(", ")}
          {failed[0]?.error ? ` — ${failed[0].error}` : ""}
        </div>
      ) : null}

      {/* Summary */}
      <div
        style={{
          fontSize: 11,
          color: T.inkMuted,
          fontFamily: T.mono,
          padding: "4px 0",
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <span>
          <span style={{ color: T.ink }}>{candidates.length}</span> detected
        </span>
        <span>
          <span style={{ color: T.cyan }}>
            {candidates.filter((c) => c.raw.reconciliation === "existing-product").length}
          </span>{" "}
          existing product
        </span>
        <span>
          <span style={{ color: T.amber }}>
            {candidates.filter((c) => c.raw.reconciliation === "new-product").length}
          </span>{" "}
          new product
        </span>
        <span>
          <span style={{ color: T.inkDim }}>{candidates.length - activeCount}</span> discarded
        </span>
      </div>

      {/* Candidate rows */}
      {candidates.map((c) => (
        <CandidateRow key={c._key} candidate={c} patchCandidate={patchCandidate} />
      ))}
    </div>
  );
}

// ── Candidate row ─────────────────────────────────────────────────────────────

function CandidateRow({
  candidate: c,
  patchCandidate,
}: {
  candidate: EditableCandidate;
  patchCandidate(key: string, patch: Partial<Omit<EditableCandidate, "_key" | "raw">>): void;
}) {
  const isExisting = c.raw.reconciliation === "existing-product";
  const badgeColor = isExisting ? T.cyan : T.amber;
  const badgeBg = isExisting ? T.cyanGlow : T.amberGlow;
  const badgeBorder = isExisting ? T.cyanDim : T.amberDim;
  const badgeText = isExisting ? "EXISTING" : "NEW";
  const dupeCount = c.raw.existing_open_bottles ?? 0;

  const patch = (p: Partial<Omit<EditableCandidate, "_key" | "raw">>) => patchCandidate(c._key, p);

  return (
    <div
      style={{
        border: `1px solid ${c.discarded ? T.hairline : T.hairline2}`,
        background: c.discarded ? "transparent" : T.surface2,
        opacity: c.discarded ? 0.4 : 1,
        display: "flex",
        flexDirection: "column",
        gap: 0,
        transition: "opacity 0.15s",
      }}
    >
      {/* Header row: badge + name + discard */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 10px",
          borderBottom: c.discarded ? "none" : `1px solid ${T.hairline}`,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontSize: 9,
            fontFamily: T.mono,
            letterSpacing: "0.14em",
            color: badgeColor,
            background: badgeBg,
            border: `1px solid ${badgeBorder}`,
            padding: "2px 6px",
            flexShrink: 0,
          }}
        >
          {badgeText}
        </span>

        {dupeCount > 0 ? (
          <span
            title={`You already have ${dupeCount} open bottle${dupeCount === 1 ? "" : "s"} of this product — skipped by default to avoid duplicates. Re-enable below if it's a genuinely new bottle.`}
            style={{
              fontSize: 9,
              fontFamily: T.mono,
              letterSpacing: "0.14em",
              color: T.amber,
              background: T.amberGlow,
              border: `1px solid ${T.amberDim}`,
              padding: "2px 6px",
              flexShrink: 0,
            }}
          >
            ⚠ HAVE {dupeCount} OPEN
          </span>
        ) : null}

        {/* Confidence chip */}
        <span
          style={{
            fontSize: 9,
            fontFamily: T.mono,
            color: T.inkDim,
            border: `1px solid ${T.hairline}`,
            padding: "2px 5px",
            flexShrink: 0,
          }}
        >
          vis {Math.round(c.raw.confidence * 100)}%
        </span>
        {c.raw.grounding_confidence ? (
          <span
            style={{
              fontSize: 9,
              fontFamily: T.mono,
              color:
                c.raw.grounding_confidence === "high"
                  ? T.green
                  : c.raw.grounding_confidence === "medium"
                    ? T.amber
                    : T.red,
              border: `1px solid ${T.hairline}`,
              padding: "2px 5px",
              flexShrink: 0,
            }}
          >
            gnd {c.raw.grounding_confidence}
          </span>
        ) : null}

        {/* Push discard button to far right */}
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() => patch({ discarded: !c.discarded })}
          aria-label={c.discarded ? "restore candidate" : "discard candidate"}
          style={{
            background: "transparent",
            border: `1px solid ${c.discarded ? T.green : T.hairline2}`,
            color: c.discarded ? T.green : T.inkMuted,
            fontFamily: T.mono,
            fontSize: 11,
            padding: "4px 8px",
            minHeight: 28,
            cursor: "pointer",
            letterSpacing: "0.08em",
            flexShrink: 0,
          }}
        >
          {c.discarded ? "RESTORE" : "DISCARD"}
        </button>
      </div>

      {c.discarded ? null : (
        <div style={{ padding: "10px 10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
          {/* Name + expression */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <label style={{ flex: "2 1 160px", display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ fontSize: 9, color: T.inkMuted, letterSpacing: "0.14em", fontFamily: T.mono }}>
                NAME
              </span>
              <FormInput
                value={c.name}
                onChange={(e) => patch({ name: e.target.value })}
                placeholder="Brand + expression"
                style={{ fontSize: 12, padding: "5px 8px" }}
              />
            </label>
            <label style={{ flex: "1 1 100px", display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ fontSize: 9, color: T.inkMuted, letterSpacing: "0.14em", fontFamily: T.mono }}>
                EXPRESSION
              </span>
              <FormInput
                value={c.expression}
                onChange={(e) => patch({ expression: e.target.value })}
                placeholder="e.g. 12 Year"
                style={{ fontSize: 12, padding: "5px 8px" }}
              />
            </label>
          </div>

          {/* Fill + size */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <label style={{ flex: "2 1 140px", display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ fontSize: 9, color: T.inkMuted, letterSpacing: "0.14em", fontFamily: T.mono }}>
                FILL LEVEL
              </span>
              <ConSelect
                value={c.fill}
                options={FILL_OPTIONS}
                onChange={(v) => patch({ fill: v as FillLevel })}
                placeholder="— unknown —"
                style={{ fontSize: 12, padding: "5px 8px" }}
              />
            </label>
            <label style={{ flex: "1 1 80px", display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ fontSize: 9, color: T.inkMuted, letterSpacing: "0.14em", fontFamily: T.mono }}>
                SIZE (ML)
              </span>
              <FormInput
                value={c.sizeMl}
                onChange={(e) => patch({ sizeMl: e.target.value })}
                placeholder="750"
                style={{ fontSize: 12, padding: "5px 8px" }}
                inputMode="numeric"
              />
            </label>
          </div>

          {/* Grounded metadata */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <label style={{ flex: "2 1 120px", display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ fontSize: 9, color: T.inkMuted, letterSpacing: "0.14em", fontFamily: T.mono }}>
                BRAND
              </span>
              <FormInput
                value={c.brand}
                onChange={(e) => patch({ brand: e.target.value })}
                placeholder="—"
                style={{ fontSize: 12, padding: "5px 8px" }}
              />
            </label>
            <label style={{ flex: "2 1 100px", display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ fontSize: 9, color: T.inkMuted, letterSpacing: "0.14em", fontFamily: T.mono }}>
                CATEGORY
              </span>
              <FormInput
                value={c.category}
                onChange={(e) => patch({ category: e.target.value })}
                placeholder="e.g. bourbon"
                style={{ fontSize: 12, padding: "5px 8px" }}
              />
            </label>
            <label style={{ flex: "1 1 70px", display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ fontSize: 9, color: T.inkMuted, letterSpacing: "0.14em", fontFamily: T.mono }}>
                ABV %
              </span>
              <FormInput
                value={c.abvPct}
                onChange={(e) => patch({ abvPct: e.target.value })}
                placeholder="40.0"
                style={{ fontSize: 12, padding: "5px 8px" }}
                inputMode="decimal"
              />
            </label>
          </div>

          {/* Provenance */}
          {c.raw.grounding_source || c.raw.grounding_rationale ? (
            <div
              style={{
                fontSize: 10,
                fontFamily: T.mono,
                color: T.inkDim,
                lineHeight: 1.5,
                paddingTop: 2,
                borderTop: `1px solid ${T.hairline}`,
              }}
            >
              {c.raw.grounding_source ? (
                <span>
                  source:{" "}
                  <span style={{ color: T.inkMuted }}>{c.raw.grounding_source.split("/").pop()}</span>
                  {" · "}
                </span>
              ) : null}
              {c.raw.grounding_rationale ? (
                <span style={{ color: T.inkDim }}>{c.raw.grounding_rationale}</span>
              ) : null}
            </div>
          ) : null}

          {/* Existing product match info */}
          {isExisting && c.raw.matched_product_id ? (
            <div
              style={{
                fontSize: 10,
                fontFamily: T.mono,
                color: T.cyan,
                background: T.cyanGlow,
                border: `1px solid ${T.cyanDim}`,
                padding: "4px 8px",
              }}
            >
              matched → {c.raw.matched_product_id} · will add a bottle to existing product
            </div>
          ) : (
            <div
              style={{
                fontSize: 10,
                fontFamily: T.mono,
                color: T.amber,
                background: T.amberGlow,
                border: `1px solid ${T.amberDim}`,
                padding: "4px 8px",
              }}
            >
              new product → will create{" "}
              <span style={{ color: T.ink }}>{toSlug(c.name) || "—"}</span> in catalog + add bottle
            </div>
          )}
        </div>
      )}
    </div>
  );
}
