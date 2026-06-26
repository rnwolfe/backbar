/**
 * Create / edit a reusable made-ingredient (orgeat, syrup, infusion, …).
 * Components are referenced by recipes via a `ref_type:"component"` build line.
 * Their own ingredients are pantry items — captured as freeform label + amount.
 */
import { useState } from "react";
import type { Component, ComponentIngredient } from "@backbar/core";
import { api } from "../../../api/client";
import { store } from "../../../store/useStore";
import { T } from "../../tokens";
import { ConSelect } from "../../Select";
import { FormInput, FormRow, FormShell, FormTextarea, toSlug } from "./FormShell";

export type ComponentOverlayMode = "create" | "edit" | "duplicate";

const KINDS = ["orgeat", "syrup", "infusion", "cordial", "tincture", "mix", "other"] as const;
const UNITS = ["ml", "oz", "tsp", "tbsp", "cup", "dash", "barspoon", "drop", "pinch", "each"] as const;

interface EditRow {
  label: string;
  amount: string;
  unit: string;
  note: string;
}

function toRows(c?: Component | null): EditRow[] {
  const rows = (c?.ingredients ?? []).map((i) => ({
    label: i.label ?? i.ref_id ?? "",
    amount: i.amount != null ? String(i.amount) : "",
    unit: i.unit ?? "",
    note: i.note ?? "",
  }));
  return rows.length ? rows : [{ label: "", amount: "", unit: "cup", note: "" }];
}

interface Props {
  mode: ComponentOverlayMode;
  initial?: Component;
  onClose(): void;
  onToast?(text: string): void;
}

export function AddComponentOverlay({ mode, initial, onClose, onToast }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [kind, setKind] = useState<string>(initial?.kind ?? "syrup");
  const [instructions, setInstructions] = useState(initial?.instructions ?? "");
  const [yieldMl, setYieldMl] = useState(initial?.yield_ml != null ? String(initial.yield_ml) : "");
  const [keeps, setKeeps] = useState(initial?.keeps ?? "");
  const [blocks, setBlocks] = useState<boolean>(initial?.blocks_makeability ?? false);
  const [onHand, setOnHand] = useState<boolean>(initial?.on_hand ?? false);
  const [rows, setRows] = useState<EditRow[]>(() => toRows(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = mode === "edit";
  const patchRow = (i: number, p: Partial<EditRow>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...p } : r)));
  const addRow = () => setRows((prev) => [...prev, { label: "", amount: "", unit: "cup", note: "" }]);
  const removeRow = (i: number) => setRows((prev) => prev.filter((_, idx) => idx !== i));

  const submit = async () => {
    if (!name.trim()) {
      setError("name is required");
      return;
    }
    const ingredients: ComponentIngredient[] = rows
      .filter((r) => r.label.trim())
      .map((r, i) => ({
        ref_type: "freeform" as const,
        ref_id: null,
        label: r.label.trim(),
        amount: r.amount.trim() ? Number.parseFloat(r.amount) : null,
        unit: (r.unit || null) as ComponentIngredient["unit"],
        note: r.note.trim() || null,
        sort: i,
      }));
    if (!ingredients.length) {
      setError("add at least one ingredient");
      return;
    }
    const body: Component = {
      id: isEdit && initial ? initial.id : toSlug(name),
      name: name.trim(),
      kind: kind as Component["kind"],
      instructions: instructions.trim() || null,
      yield_ml: yieldMl.trim() ? Number.parseFloat(yieldMl) : null,
      keeps: keeps.trim() || null,
      notes: null,
      blocks_makeability: blocks,
      on_hand: onHand,
      ingredients,
    };
    setBusy(true);
    setError(null);
    try {
      if (isEdit && initial) await api.updateComponent(initial.id, body);
      else await api.createComponent(body);
      await store.refreshComponents();
      onToast?.(`${isEdit ? "updated" : "saved"} · ${body.name}`);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "save failed");
      setBusy(false);
    }
  };

  return (
    <FormShell
      title={isEdit ? "Edit component" : mode === "duplicate" ? "Duplicate component" : "New component"}
      subtitle="A reusable made-ingredient — orgeat, syrup, infusion. Recipes reference it as one build line."
      onClose={onClose}
      onSubmit={() => void submit()}
      submitLabel={isEdit ? "✓ SAVE CHANGES" : "✓ SAVE COMPONENT"}
      submitting={busy}
      error={error}
      width={620}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 160px", gap: 10 }}>
          <FormRow label="Name">
            <FormInput value={name} placeholder="Mazapán Orgeat" onChange={(e) => setName(e.target.value)} />
          </FormRow>
          <FormRow label="Kind">
            <ConSelect value={kind} options={KINDS as unknown as string[]} onChange={setKind} />
          </FormRow>
        </div>

        <FormRow label="Ingredients" hint="Pantry items — label + amount. (almond milk, sugar, …)">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {rows.map((r, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 70px 90px 28px", gap: 6 }}>
                <FormInput
                  value={r.label}
                  placeholder="almond milk"
                  onChange={(e) => patchRow(i, { label: e.target.value })}
                />
                <FormInput
                  value={r.amount}
                  type="number"
                  placeholder="amt"
                  onChange={(e) => patchRow(i, { amount: e.target.value })}
                />
                <ConSelect value={r.unit} options={UNITS as unknown as string[]} onChange={(v) => patchRow(i, { unit: v })} />
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  title="remove"
                  style={{
                    background: "transparent",
                    border: `1px solid ${T.hairline2}`,
                    color: T.inkMuted,
                    cursor: "pointer",
                    fontFamily: T.mono,
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addRow}
              style={{
                alignSelf: "flex-start",
                background: "transparent",
                border: `1px dashed ${T.hairline2}`,
                color: T.cyan,
                fontFamily: T.mono,
                fontSize: 11,
                padding: "4px 10px",
                cursor: "pointer",
              }}
            >
              + ingredient
            </button>
          </div>
        </FormRow>

        <FormRow label="Instructions">
          <FormTextarea
            value={instructions}
            placeholder="Blend until smooth. Keep refrigerated in a sealed container."
            rows={3}
            onChange={(e) => setInstructions(e.target.value)}
          />
        </FormRow>

        <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 10 }}>
          <FormRow label="Yield (ml)" hint="optional">
            <FormInput value={yieldMl} type="number" placeholder="750" onChange={(e) => setYieldMl(e.target.value)} />
          </FormRow>
          <FormRow label="Keeps" hint="shelf life">
            <FormInput value={keeps} placeholder="2 weeks refrigerated" onChange={(e) => setKeeps(e.target.value)} />
          </FormRow>
        </div>

        <FormRow
          label="Makeability"
          hint={
            blocks
              ? "Recipes using this are unmakeable unless it's marked on hand. Use for preps that need a special ingredient or a real batch."
              : "Off: never blocks a recipe (e.g. simple syrup you can whip up on demand)."
          }
        >
          <div style={{ display: "flex", gap: 8 }}>
            <Toggle label="BLOCKS MAKEABILITY" on={blocks} onClick={() => setBlocks((v) => !v)} />
            <Toggle label="ON HAND" on={onHand} disabled={!blocks} onClick={() => setOnHand((v) => !v)} />
          </div>
        </FormRow>
      </div>
    </FormShell>
  );
}

function Toggle({
  label,
  on,
  disabled,
  onClick,
}: {
  label: string;
  on: boolean;
  disabled?: boolean;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1,
        height: 36,
        background: on ? T.cyanGlow : "transparent",
        border: `1px solid ${on ? T.cyan : T.hairline2}`,
        color: on ? T.cyan : T.inkMuted,
        fontFamily: T.mono,
        fontSize: 10,
        letterSpacing: "0.1em",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {on ? "● " : "○ "}
      {label}
    </button>
  );
}
