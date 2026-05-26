import { useParams } from "react-router-dom";
import { ShareLoading, ShareNotFound, ShareShell, useShareResource } from "./shared";

interface PublicProduct {
  id: string;
  name: string;
  category: string;
  subcategory: string | null;
  abv: number | null;
  distillery: string | null;
  origin_country: string | null;
  origin_region: string | null;
  age_statement_y: number | null;
  flavor_tags: string[];
  notes: string | null;
}

interface PublicBottle {
  id: string;
  product: PublicProduct;
  full_ml: number;
  opened_at: number | null;
  purchased_at: number | null;
  fullness: "fresh" | "open" | "low" | "empty";
}

const FULLNESS_COPY: Record<PublicBottle["fullness"], string> = {
  fresh: "Just opened",
  open: "In service",
  low: "Down to the bottom of the bottle",
  empty: "We just polished this off",
};

export function BottleShareCard() {
  const { id = "" } = useParams();
  const state = useShareResource<PublicBottle>(`/api/guest/bottles/${encodeURIComponent(id)}`);

  if (state.status === "loading") return <ShareLoading />;
  if (state.status === "error" || !state.data) return <ShareNotFound kind="bottle" id={id} />;
  const { product, fullness, opened_at, full_ml } = state.data;

  const lineage = [product.subcategory, product.category].filter(Boolean).join(" / ");
  const origin = [product.origin_region, product.origin_country].filter(Boolean).join(", ");

  return (
    <ShareShell
      eyebrow={lineage || product.category}
      title={product.name}
      subtitle={product.distillery ?? null}
    >
      <p className="text-center font-display italic text-ink-2 text-lg">
        {FULLNESS_COPY[fullness]}
      </p>

      <dl className="mt-10 divide-y divide-rule/60">
        <Row label="Bottle" value={`${full_ml} ml`} />
        {product.abv != null ? (
          <Row label="ABV" value={`${Math.round(product.abv * 1000) / 10}%`} />
        ) : null}
        {product.age_statement_y != null ? (
          <Row label="Age" value={`${product.age_statement_y} yr`} />
        ) : null}
        {origin ? <Row label="Origin" value={origin} /> : null}
        {opened_at ? <Row label="Opened" value={formatDate(opened_at)} /> : null}
        {product.flavor_tags.length > 0 ? (
          <Row label="Flavor" value={product.flavor_tags.join(", ")} />
        ) : null}
      </dl>

      {product.notes ? (
        <section className="mt-10">
          <h2 className="small-caps">Notes</h2>
          <p className="mt-3 font-display italic text-ink-2 text-lg leading-relaxed">
            {product.notes}
          </p>
        </section>
      ) : null}
    </ShareShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <dt className="small-caps">{label}</dt>
      <dd className="font-display text-lg text-ink-2 text-right">{value}</dd>
    </div>
  );
}

function formatDate(unix_ms: number): string {
  return new Date(unix_ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
