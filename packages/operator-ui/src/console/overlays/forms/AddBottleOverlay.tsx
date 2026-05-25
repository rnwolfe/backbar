/**
 * Add / Edit / Duplicate Bottle.
 *
 *   create    → POST /bottles
 *   edit      → PATCH /bottles/:id (product_id locked — bottles can't change identity)
 *   duplicate → POST /bottles for the same product with default level=full
 *
 * Server fills sensible defaults from product.default_ml; we expose full_ml
 * and level_ml so the operator can override on receipt.
 */
import { useMemo, useState } from "react";
import type { Bottle } from "@backbar/core";
import { api } from "../../../api/client";
import { store, useStore } from "../../../store/useStore";
import { ConSelect } from "../../Select";
import { FormInput, FormRow, FormShell } from "./FormShell";

export type BottleOverlayMode = "create" | "edit" | "duplicate";

interface Props {
  onClose(): void;
  onToast?(text: string): void;
  /** Pre-select a product (used when Add Bottle launches from a product context). */
  defaultProductId?: string;
  mode?: BottleOverlayMode;
  initial?: Bottle;
}

export function AddBottleOverlay({
  onClose,
  onToast,
  defaultProductId,
  mode = "create",
  initial,
}: Props) {
  const products = useStore((s) => s.products);
  const isEdit = mode === "edit";
  const isDuplicate = mode === "duplicate";

  const [productId, setProductId] = useState(initial?.product_id ?? defaultProductId ?? "");
  const [search, setSearch] = useState("");
  const [fullMlStr, setFullMlStr] = useState(String(initial?.full_ml ?? 750));
  const [levelMlStr, setLevelMlStr] = useState(
    String(initial && !isDuplicate ? initial.level_ml : initial?.full_ml ?? 750),
  );
  const [tracked, setTracked] = useState<boolean>(initial?.tracked ?? false);
  const [slot, setSlot] = useState(initial?.slot ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredProducts = useMemo(
    () =>
      products
        .filter((p) =>
          search ? p.name.toLowerCase().includes(search.toLowerCase()) || p.id.includes(search.toLowerCase()) : true,
        )
        .slice(0, 20),
    [products, search],
  );

  const onPickProduct = (p: typeof products[number]) => {
    setProductId(p.id);
    if (p.default_ml != null) {
      setFullMlStr(String(p.default_ml));
      setLevelMlStr(String(p.default_ml));
    }
  };

  const submit = async () => {
    if (!productId) {
      setError("pick a product");
      return;
    }
    const full = Number.parseInt(fullMlStr, 10);
    const level = Number.parseFloat(levelMlStr);
    if (!Number.isFinite(full) || full <= 0) {
      setError("full_ml must be a positive integer");
      return;
    }
    if (!Number.isFinite(level) || level < 0 || level > full) {
      setError(`level_ml must be 0–${full}`);
      return;
    }
    setSubmitting(true);
    setError(null);
    const payload = {
      product_id: productId,
      full_ml: full,
      level_ml: level,
      status: "open" as const,
      tracked,
      slot: tracked && slot.trim() ? slot.trim() : null,
    };
    try {
      const productName = products.find((p) => p.id === productId)?.name ?? productId;
      if (isEdit && initial) {
        await api.patchBottle(initial.id, payload);
        onToast?.(`updated bottle · ${productName} @ ${level}/${full}ml`);
      } else {
        await api.createBottle(payload);
        onToast?.(
          isDuplicate
            ? `duplicated · new ${productName} @ ${level}/${full}ml`
            : `added bottle · ${productName} @ ${level}/${full}ml`,
        );
      }
      await store.hydrate();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "save failed");
    } finally {
      setSubmitting(false);
    }
  };

  const selectedProduct = products.find((p) => p.id === productId);

  return (
    <FormShell
      title={
        isEdit
          ? `Edit · ${products.find((p) => p.id === productId)?.name ?? productId} bottle`
          : isDuplicate
            ? "Duplicate bottle"
            : "Add bottle"
      }
      subtitle={
        isEdit
          ? "Edit level / capacity / tracking. Product is fixed — bottles can't change identity."
          : isDuplicate
            ? "Same product, fresh bottle (level defaults to full). Useful when stocking a backup."
            : "Drop a new bottle into inventory. Slot binding to a sensor channel happens later via Shelf."
      }
      onClose={onClose}
      onSubmit={() => void submit()}
      submitting={submitting}
      submitDisabled={!productId}
      submitLabel={isEdit ? "✓ SAVE CHANGES" : isDuplicate ? "✓ CREATE DUPLICATE" : "✓ SAVE"}
      error={error}
      width={620}
    >
      <FormRow
        label="Product"
        hint={
          selectedProduct
            ? isEdit
              ? `${selectedProduct.id} · fixed on existing bottles`
              : `${selectedProduct.id} · ${selectedProduct.category}`
            : "search by name or id"
        }
      >
        {selectedProduct ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <FormInput value={selectedProduct.name} readOnly style={{ flex: 1 }} />
            {!isEdit ? (
              <button
                type="button"
                onClick={() => setProductId("")}
                style={{
                  padding: "6px 10px",
                  background: "transparent",
                  border: "1px solid #262f3c",
                  color: "#8794a6",
                  fontFamily: "ui-monospace, monospace",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                CHANGE
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <FormInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buffalo Trace, tanqueray, …"
              autoFocus
            />
            <div
              style={{
                maxHeight: 160,
                overflow: "auto",
                border: "1px solid #1c232d",
                background: "#0f1318",
                marginTop: 4,
              }}
            >
              {filteredProducts.length === 0 ? (
                <div style={{ padding: 10, fontSize: 12, color: "#4a5566" }}>no matches</div>
              ) : (
                filteredProducts.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => onPickProduct(p)}
                    style={{
                      padding: "6px 10px",
                      cursor: "pointer",
                      borderBottom: "1px solid #1c232d",
                      display: "flex",
                      gap: 10,
                      alignItems: "baseline",
                    }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.background = "#141921")}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.background = "transparent")}
                  >
                    <span style={{ fontSize: 13, color: "#dbe2ec", flex: 1 }}>{p.name}</span>
                    <span style={{ fontSize: 10, color: "#8794a6", fontFamily: "ui-monospace, monospace" }}>
                      {p.category}
                    </span>
                    <span style={{ fontSize: 10, color: "#4a5566", fontFamily: "ui-monospace, monospace" }}>
                      {p.id}
                    </span>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </FormRow>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <FormRow label="Full (ml)" hint="bottle capacity">
          <FormInput
            type="number"
            min={1}
            value={fullMlStr}
            onChange={(e) => setFullMlStr(e.target.value)}
            placeholder="750"
          />
        </FormRow>
        <FormRow label="Current level (ml)" hint="0 to full · defaults to full for a sealed bottle">
          <FormInput
            type="number"
            min={0}
            value={levelMlStr}
            onChange={(e) => setLevelMlStr(e.target.value)}
            placeholder="750"
          />
        </FormRow>
      </div>

      <FormRow label="Tracking" hint="manual reads ml directly; tracked bottles take weight via sensor channel">
        <ConSelect
          value={tracked ? "tracked" : "manual"}
          options={[
            { value: "manual", label: "manual", hint: "operator updates ml" },
            { value: "tracked", label: "tracked", hint: "weight via sensor channel" },
          ]}
          onChange={(v) => setTracked(v === "tracked")}
        />
      </FormRow>

      {tracked ? (
        <FormRow label="Slot" hint="optional · the physical shelf slot label, e.g. shelf-back-left/01">
          <FormInput
            value={slot}
            onChange={(e) => setSlot(e.target.value)}
            placeholder="shelf-back-left/01"
          />
        </FormRow>
      ) : null}
    </FormShell>
  );
}
