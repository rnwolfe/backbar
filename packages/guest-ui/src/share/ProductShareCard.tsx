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

export function ProductShareCard() {
  const { id = "" } = useParams();
  const state = useShareResource<PublicProduct>(`/api/guest/products/${encodeURIComponent(id)}`);

  if (state.status === "loading") return <ShareLoading />;
  if (state.status === "error" || !state.data) return <ShareNotFound kind="product" id={id} />;
  return renderProduct(state.data);
}

export function renderProduct(p: PublicProduct) {
  const lineage = [p.subcategory, p.category].filter(Boolean).join(" / ");
  const origin = [p.origin_region, p.origin_country].filter(Boolean).join(", ");

  return (
    <ShareShell
      eyebrow={lineage || p.category}
      title={p.name}
      subtitle={p.distillery ?? null}
    >
      <dl className="mt-2 divide-y divide-rule/60">
        {p.abv != null ? (
          <Row label="ABV" value={`${Math.round(p.abv * 1000) / 10}%`} />
        ) : null}
        {p.age_statement_y != null ? (
          <Row label="Age" value={`${p.age_statement_y} yr`} />
        ) : null}
        {origin ? <Row label="Origin" value={origin} /> : null}
        {p.flavor_tags.length > 0 ? (
          <Row label="Flavor" value={p.flavor_tags.join(", ")} />
        ) : null}
      </dl>

      {p.notes ? (
        <section className="mt-10">
          <h2 className="small-caps">Notes</h2>
          <p className="mt-3 font-display italic text-ink-2 text-lg leading-relaxed">
            {p.notes}
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
