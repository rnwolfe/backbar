import { describe, expect, test } from "bun:test";
import { VaAbcClient, createVaAbcSource } from "../src/integrations/va-abc";

/** Build a fake fetch that returns canned JSON per matched URL substring. */
function fakeFetch(routes: { match: string; status?: number; body: unknown }[]): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const route = routes.find((r) => url.includes(r.match));
    if (!route) throw new Error(`unexpected fetch: ${url}`);
    const body = typeof route.body === "string" ? route.body : JSON.stringify(route.body);
    return new Response(body, { status: route.status ?? 200 });
  }) as unknown as typeof fetch;
}

// A Coveo result for Planteray Original Dark (sku 042395), char-encoded keys.
const coveoOftd = {
  results: [
    {
      clickUri: "https://www.abc.virginia.gov/products/042395",
      raw: {
        z95xproductz32xskuz32xids: "042395",
        productz32xlabelz32xname: "Planteray Original Dark Rum",
        z95xproductz32xpricez32xsort: 24.99,
        z95xproductz32xlimitedz32xavailability: "0",
      },
    },
  ],
};

const storeNearbyOftd = {
  products: [
    {
      productId: "042395",
      storeInfo: { storeId: 88, quantity: 0, distance: 0.0, city: "Richmond", address: "1 Main St" },
      nearbyStores: [
        { storeId: 152, quantity: 3, distance: 4.2, city: "Henrico" },
        { storeId: 207, quantity: 1, distance: 1.1, city: "Midlothian" },
      ],
    },
  ],
};

describe("VaAbcClient", () => {
  test("searchProducts decodes Coveo raw fields → code/name/price", async () => {
    const client = new VaAbcClient({
      minIntervalMs: 0,
      fetchImpl: fakeFetch([{ match: "/coveo/rest/search", body: coveoOftd }]),
    });
    const out = await client.searchProducts("planteray original dark");
    expect(out).toHaveLength(1);
    expect(out[0].code).toBe("042395");
    expect(out[0].name).toBe("Planteray Original Dark Rum");
    expect(out[0].priceCents).toBe(2499);
    expect(out[0].allocated).toBe(false);
  });

  test("pad6 normalizes a short code from search", async () => {
    const client = new VaAbcClient({
      minIntervalMs: 0,
      fetchImpl: fakeFetch([
        { match: "/coveo/rest/search", body: { results: [{ raw: { z95xproductz32xskuz32xids: "9537" } }] } },
      ]),
    });
    const out = await client.searchProducts("x");
    expect(out[0].code).toBe("009537");
  });

  test("storeNearby maps anchor + nearby stores", async () => {
    const client = new VaAbcClient({
      minIntervalMs: 0,
      fetchImpl: fakeFetch([{ match: "/webapi/inventory/storeNearby", body: storeNearbyOftd }]),
    });
    const inv = await client.storeNearby(88, "042395");
    expect(inv.anchor.storeNumber).toBe(88);
    expect(inv.anchor.quantity).toBe(0);
    expect(inv.nearby).toHaveLength(2);
    expect(inv.nearby[0].distanceMi).toBe(4.2);
  });

  test("400 → not-found VaAbcError", async () => {
    const client = new VaAbcClient({
      minIntervalMs: 0,
      fetchImpl: fakeFetch([
        { match: "/webapi/inventory/storeNearby", status: 400, body: { message: "Missing required parameter" } },
      ]),
    });
    await expect(client.storeNearby(88, "042395")).rejects.toMatchObject({
      name: "VaAbcError",
      kind: "not-found",
    });
  });

  test("Cloudflare challenge on 403 → rate-limited", async () => {
    const client = new VaAbcClient({
      minIntervalMs: 0,
      fetchImpl: fakeFetch([
        { match: "/coveo/rest/search", status: 403, body: "<html>Just a moment...</html>" },
      ]),
    });
    await expect(client.searchProducts("x")).rejects.toMatchObject({ kind: "rate-limited" });
  });
});

describe("createVaAbcSource.lookup", () => {
  test("resolves by name, returns nearest in-stock store sorted by distance", async () => {
    const source = createVaAbcSource({
      resolveHomeStore: () => 88,
      minIntervalMs: 0,
      fetchImpl: fakeFetch([
        { match: "/coveo/rest/search", body: coveoOftd },
        { match: "/webapi/inventory/storeNearby", body: storeNearbyOftd },
      ]),
    });
    const res = await source.lookup({ name: "Planteray Original Dark Rum" });
    expect(res).not.toBeNull();
    expect(res!.resolvedCode).toBe("042395");
    expect(res!.priceCents).toBe(2499);
    expect(res!.inStock).toBe(true);
    // store 88 (qty 0) filtered out; 207 (1.1mi) before 152 (4.2mi).
    expect(res!.stores.map((s) => s.storeNumber)).toEqual([207, 152]);
  });

  test("uses pinned va_abc_code without searching", async () => {
    const source = createVaAbcSource({
      resolveHomeStore: () => 88,
      minIntervalMs: 0,
      // No coveo route registered → would throw if it searched.
      fetchImpl: fakeFetch([{ match: "/webapi/inventory/storeNearby", body: storeNearbyOftd }]),
    });
    const res = await source.lookup({ name: "whatever", va_abc_code: "042395" });
    expect(res!.resolvedCode).toBe("042395");
    expect(res!.inStock).toBe(true);
  });

  test("degrades to null when upstream fails", async () => {
    const source = createVaAbcSource({
      resolveHomeStore: () => 88,
      minIntervalMs: 0,
      fetchImpl: fakeFetch([
        { match: "/coveo/rest/search", body: coveoOftd },
        { match: "/webapi/inventory/storeNearby", status: 500, body: "boom" },
      ]),
    });
    const res = await source.lookup({ name: "Planteray Original Dark Rum" });
    expect(res).toBeNull();
  });

  test("null when name resolves to nothing", async () => {
    const source = createVaAbcSource({
      resolveHomeStore: () => 88,
      minIntervalMs: 0,
      fetchImpl: fakeFetch([{ match: "/coveo/rest/search", body: { results: [] } }]),
    });
    expect(await source.lookup({ name: "nonexistent xyz" })).toBeNull();
  });

  test("no home store set → null with zero network calls", async () => {
    let calls = 0;
    const source = createVaAbcSource({
      resolveHomeStore: () => null,
      minIntervalMs: 0,
      fetchImpl: (async () => {
        calls++;
        return new Response("{}");
      }) as unknown as typeof fetch,
    });
    expect(await source.lookup({ name: "anything", va_abc_code: "042395" })).toBeNull();
    expect(calls).toBe(0);
  });
});
