import { useParams } from "react-router-dom";
import { ShareLoading, ShareNotFound, ShareShell, useShareResource } from "./shared";

interface PublicRecipeIngredient {
  label: string;
  amount: number | null;
  unit: string | null;
  optional: boolean;
  garnish: boolean;
}

interface PublicRecipe {
  id: string;
  name: string;
  family: string | null;
  method: string | null;
  glass: string | null;
  ice: string | null;
  garnish: string | null;
  instructions: string | null;
  tags: string[];
  abv_estimate: number | null;
  ingredients: PublicRecipeIngredient[];
}

export function RecipeShareCard() {
  const { id = "" } = useParams();
  const state = useShareResource<PublicRecipe>(`/api/guest/recipes/${encodeURIComponent(id)}`);

  if (state.status === "loading") return <ShareLoading />;
  if (state.status === "error" || !state.data) return <ShareNotFound kind="recipe" id={id} />;
  const recipe = state.data;

  const cues = [recipe.method, recipe.glass, recipe.ice].filter(Boolean).join(" · ");
  const pour = recipe.ingredients.filter((i) => !i.optional && !i.garnish);
  const accents = recipe.ingredients.filter((i) => i.optional || i.garnish);

  return (
    <ShareShell
      eyebrow={recipe.family ?? "Cocktail"}
      title={recipe.name}
      subtitle={cues || null}
    >
      <section>
        <h2 className="small-caps">Pour</h2>
        <ul className="mt-3 divide-y divide-rule/60">
          {pour.map((ing, i) => (
            <li key={i} className="flex items-baseline justify-between gap-3 py-2">
              <span className="font-display text-lg">{ing.label}</span>
              <span className="font-display text-ink-2 tabular-nums">
                {formatAmount(ing)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {accents.length > 0 ? (
        <section className="mt-10">
          <h2 className="small-caps">Garnish &amp; accents</h2>
          <ul className="mt-3 divide-y divide-rule/40">
            {accents.map((ing, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3 py-2 text-ink-2">
                <span className="font-display italic">{ing.label}</span>
                <span className="small-caps">{ing.garnish ? "Garnish" : "Optional"}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {recipe.instructions ? (
        <section className="mt-10">
          <h2 className="small-caps">Method</h2>
          <p className="mt-3 font-display italic text-ink-2 text-lg leading-relaxed">
            {recipe.instructions}
          </p>
        </section>
      ) : null}

      {recipe.garnish ? (
        <p className="mt-8 small-caps">Serve with: {recipe.garnish}</p>
      ) : null}

      {recipe.tags.length > 0 ? (
        <p className="mt-6 small-caps">{recipe.tags.join(" · ")}</p>
      ) : null}

      {recipe.abv_estimate != null ? (
        <p className="mt-6 small-caps">~ {Math.round(recipe.abv_estimate * 100)}% ABV</p>
      ) : null}
    </ShareShell>
  );
}

function formatAmount(ing: PublicRecipeIngredient): string {
  if (ing.amount == null) return ing.unit ?? "—";
  return `${trim(ing.amount)} ${ing.unit ?? ""}`.trim();
}

function trim(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
}
