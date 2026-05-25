import { describe, expect, test } from "bun:test";
import { evaluate, type InvBottle, type Recipe } from "@backbar/core";
import { productTags as productTagsRepo, products as productsRepo } from "@backbar/db";
import { call, setup } from "./_helpers";

describe("§3a product columns persist round-trip", () => {
  test("POST /products with distillery / origin / age writes the typed fields", async () => {
    const { app, db } = setup();
    const res = await call(app, "POST", "/products", {
      id: "foursquare-2008",
      name: "Foursquare 2008",
      category: "spirit",
      subcategory: "rum",
      abv: 0.6,
      distillery: "Foursquare Distillery",
      origin_country: "BB",
      origin_region: "Saint Philip",
      age_statement_y: 12,
      flavor_tags: [],
    });
    expect(res.status).toBe(201);
    const saved = productsRepo(db).get("foursquare-2008")!;
    expect(saved.distillery).toBe("Foursquare Distillery");
    expect(saved.origin_country).toBe("BB");
    expect(saved.age_statement_y).toBe(12);
  });

  test("origin_country rejects non-ISO-3166 codes", async () => {
    const { app } = setup();
    const res = await call(app, "POST", "/products", {
      id: "bad-product",
      name: "Bad Product",
      category: "spirit",
      origin_country: "BARBADOS", // should be "BB"
      flavor_tags: [],
    });
    expect(res.status).toBe(400);
  });
});

describe("§3b product_tag table", () => {
  test("POST /products with tags inserts them atomically", async () => {
    const { app, db } = setup();
    const res = await call(app, "POST", "/products", {
      id: "planteray-oftd",
      name: "Planteray OFTD",
      category: "spirit",
      subcategory: "rum",
      abv: 0.69,
      flavor_tags: [],
      tags: [
        { namespace: "smugglers-cove", value: "blended-overproof-rum" },
        { namespace: "smugglers-cove", value: "pot-still-rum" },
        { namespace: "operator", value: "tiki-staple" },
      ],
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.tags.length).toBe(3);
    expect(productTagsRepo(db).forProduct("planteray-oftd").length).toBe(3);
  });

  test("PUT /products/:id/tags replaces the tag set wholesale", async () => {
    const { app, db } = setup();
    productsRepo(db).insert({
      id: "p1",
      name: "P1",
      category: "spirit",
      flavor_tags: [],
    });
    productTagsRepo(db).add({ product_id: "p1", namespace: "operator", value: "old" });

    const res = await call(app, "PUT", "/products/p1/tags", {
      tags: [
        { namespace: "operator", value: "new" },
        { namespace: "flavor", value: "smoky" },
      ],
    });
    expect(res.status).toBe(200);
    const after = productTagsRepo(db).forProduct("p1");
    expect(after.length).toBe(2);
    expect(after.some((t) => t.value === "old")).toBe(false);
    expect(after.some((t) => t.value === "smoky")).toBe(true);
  });

  test("GET /products/_/namespaces lists distinct namespaces", async () => {
    const { app, db } = setup();
    productTagsRepo(db).add({ product_id: "rum", namespace: "smugglers-cove", value: "white-light-rum" });
    productTagsRepo(db).add({ product_id: "rum", namespace: "operator", value: "house-favorite" });
    const res = await call(app, "GET", "/products/_/namespaces");
    const ns = await res.json();
    expect(ns).toEqual(["operator", "smugglers-cove"]);
  });
});

describe("makeability tag matcher", () => {
  test("namespaced tag ref (smugglers-cove:column-still-rum) matches product_tag rows", () => {
    const inv: InvBottle[] = [
      {
        id: "b1",
        product_id: "planteray-3-star",
        full_ml: 750,
        level_ml: 700,
        status: "open",
        tracked: false,
        product: {
          id: "planteray-3-star",
          name: "Planteray 3 Star",
          category: "spirit",
          flavor_tags: [],
        },
        tags: [
          { product_id: "planteray-3-star", namespace: "smugglers-cove", value: "column-still-rum" },
          { product_id: "planteray-3-star", namespace: "smugglers-cove", value: "white-light-rum" },
        ],
      },
    ];
    const recipe: Recipe = {
      id: "test",
      name: "Test",
      is_published: false,
      tags: [],
      ingredients: [
        {
          ref_type: "tag",
          ref_id: "smugglers-cove:column-still-rum",
          amount: 60,
          unit: "ml",
          optional: false,
          garnish: false,
          sort: 0,
        },
      ],
    };
    const result = evaluate(recipe, inv);
    expect(result.state).toBe("makeable");
    expect(result.bindings[0]!.bottle_id).toBe("b1");
  });

  test("bare tag ref (no namespace) falls back to flavor_tags for back-compat", () => {
    const inv: InvBottle[] = [
      {
        id: "b1",
        product_id: "carpano",
        full_ml: 750,
        level_ml: 700,
        status: "open",
        tracked: false,
        product: {
          id: "carpano",
          name: "Carpano Antica",
          category: "vermouth",
          flavor_tags: ["sweet-vermouth"],
        },
      },
    ];
    const recipe: Recipe = {
      id: "negroni-like",
      name: "Negroni",
      is_published: false,
      tags: [],
      ingredients: [
        {
          ref_type: "tag",
          ref_id: "sweet-vermouth",
          amount: 30,
          unit: "ml",
          optional: false,
          garnish: false,
          sort: 0,
        },
      ],
    };
    const result = evaluate(recipe, inv);
    expect(result.state).toBe("makeable");
  });

  test("namespaced ref doesn't match flavor_tags (must use product_tag table)", () => {
    const inv: InvBottle[] = [
      {
        id: "b1",
        product_id: "p1",
        full_ml: 750,
        level_ml: 700,
        status: "open",
        tracked: false,
        product: {
          id: "p1",
          name: "P1",
          category: "spirit",
          // flavor_tags has the same value but matcher won't match the
          // namespaced ref against the freeform array.
          flavor_tags: ["column-still-rum"],
        },
        tags: [],
      },
    ];
    const recipe: Recipe = {
      id: "test",
      name: "Test",
      is_published: false,
      tags: [],
      ingredients: [
        {
          ref_type: "tag",
          ref_id: "smugglers-cove:column-still-rum",
          amount: 60,
          unit: "ml",
          optional: false,
          garnish: false,
          sort: 0,
        },
      ],
    };
    const result = evaluate(recipe, inv);
    // Single missing ingredient → "one-away" (the engine's tier ladder); the
    // important assertion is that the tag DIDN'T match — the ingredient is
    // unbound, not the recipe state.
    expect(result.state).toBe("one-away");
    expect(result.missing.length).toBe(1);
  });
});
