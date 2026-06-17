# Spike — First-class agentic operator experience

> Research/design spike. Goal: turn the AI from a recipe-brainstorm sidecar into
> a **first-class agentic assistant** that runs throughout the operator console —
> grounded in the tool registry + flavor corpus we just shipped
> (`specs/ai-grounding-*.md`). Covers the **JTBD/CUJs** an operator would hire it
> for, the **chat-UX anatomy** (tool cards, thinking indicators, entity
> hovercards), and the **technical architecture** (AI-SDK v5 streaming over
> `buildTools`). Not authoritative; outlines the build.

---

## 0. TL;DR

- **Where it lives:** a persistent, **context-aware chat dock** (right rail on
  desktop, bottom sheet on mobile) launchable from every view via the TopBar +
  ⌘K — not a destination you navigate *to*, an assistant that's *always there*
  and knows what you're looking at. Its outputs are **live, actionable links**
  into the same objects the console shows.
- **What it's for (the core):** five operator jobs — *make something now*,
  *curate the library*, *manage inventory*, *teach/explain*, *run service*. §2.
- **How it's built:** `POST /ai/chat` = AI-SDK v5 `streamText({ tools:
  buildTools(deps), stopWhen })` → `toUIMessageStreamResponse()`; client uses
  `useChat` + `DefaultChatTransport` (bearer). The 11 tools are read-only;
  *actions* (save recipe, 86 a bottle, publish menu) go through **propose →
  operator-confirms** UI that hits existing REST, which emits bus events so the
  rest of the app updates live. §5.
- **The two UX differentiators:** **expandable tool-call cards** (tool parts are
  a streaming state machine) and **entity chips with hovercards** (typed
  `data-entity-*` parts the client resolves to live bottles/products/recipes,
  re-validated against `makeable` — "AI never trusted" applied to the UI). §4.
- **Components:** hand-built on the existing dense-dark `T` tokens + primitives
  (`Cell`/`Pill`/`Tooltip`/overlays), *not* shadcn/Elements (aesthetic mismatch);
  Elements is a useful reference. §6.

---

## 1. Why — sidecar → first-class

Today the agent is a right-rail panel inside the Recipes view
(`views/Recipes.tsx:315–450`): one-shot `POST /ai/ideate` → a result card, modes
`now`/`riff`/`muse`. It's good but it's a *feature of one screen*. An operator
managing a ~100-bottle bar has jobs that span inventory, the library, service,
and learning — and the agent now has real expertise to draw on (balance/ABV math,
flavor profiles, pairing, substitution, food pairing). The opportunity is to make
that expertise **ambient and conversational**: ask in natural language from
anywhere, watch it reason with visible tools, and act on the result in place.

---

## 2. Jobs-to-be-done & critical user journeys

The product core. Five jobs an operator hires the agent for, each with example
prompts, the tools/data it leans on, and whether it **reads** or **writes**.

### Job 1 — "Make me something now" (in-the-moment decisions) · mostly READ
The bartender-at-your-elbow. The single highest-frequency job.
- *"What can I actually make right now that's stirred and a little bitter?"* →
  `check_makeable` + `classify_family` + `check_balance`, grounded in live stock.
- *"A guest wants something refreshing and low-ABV."* → constrained ideation +
  `compute_dilution`/ABV to hit the target.
- *"Riff on the Last Word but I'm out of Chartreuse."* → `flavor_similar` →
  `check_balance` → `check_makeable`; proposes the swap with the tradeoff.
- *"Pair a drink with the carbonara I'm about to eat."* → `score_food_pairing`
  across the makeable set; ranks with a plain "why."
- **Write tail:** "make it" → save as a recipe + optionally log the pour.

### Job 2 — "Curate my cocktail library" · READ + WRITE
- *"Design three originals that show off my mezcal and would actually pass."* →
  ideate + `check_balance`/`classify_family`; each saved as a draft recipe.
- *"Audit my library — what's unbalanced or mis-labeled?"* → run `check_balance`
  + `classify_family` across saved recipes; surface a fix-list (e.g. "this
  'sour' has no acid"). High-value, uniquely enabled by the new tools.
- *"This book-photo import — does it check out, and what does it pair with?"* →
  validate the imported draft, suggest garnish/glass, food pairings.
- **Write:** create/patch recipes (existing `POST/PATCH /recipes`), set
  `is_published`.

### Job 3 — "Manage inventory intelligently" · READ + WRITE
- *"What should I buy next?"* → the shopping muse (`coverage()`), but
  conversational: what each bottle *unlocks* + which flavor lane it fills.
- *"I'm out of Cointreau — what substitutes, and what recipes are affected?"* →
  `flavor_similar` + a makeability re-check across the library.
- *"I bought this (photo) — add it and tell me what it unlocks."* → photo-import
  (exists) + coverage delta.
- **Write:** 86 a drink / mark low / add a bottle (existing `PATCH /bottles`,
  `POST /bottles`) — all emit `makeable.changed`/`lowstock.crossed` to `/live`.

### Job 4 — "Teach me / explain" (sommelier-in-your-pocket) · READ-only
- *"Why does the Negroni work?"* → `flavor_profile` (Campari/gin/vermouth) +
  `check_balance`, answered with inline **entity chips** you can hover/open.
- *"Difference between my two ryes in an Old Fashioned?"* → side-by-side
  `flavor_profile`.
- *"What makes a sour balanced?"* → `suggest_ratio` + balance teaching. Pure
  reasoning over the corpus — no risk, great for trust-building.

### Job 5 — "Run the bar as a system" · READ + WRITE
- *"Set tonight's guest menu to six makeable crowd-pleasers and publish."* →
  curate makeable set → the publish flow we built (`POST /menu/publish`).
- *"What sold tonight / this week?"* → pour analytics summary.
- *"Batch + dilution math for a party of 20."* → scaling + `compute_dilution`
  (+ a future `acid_adjust`).

**Why these five and not "a chatbot":** each is anchored to data + tools we
already have, each produces an **actionable artifact** (a drink to save, a menu
to publish, a shopping pick, an explanation with live links), and together they
make the agent the connective tissue across inventory ↔ library ↔ service rather
than a novelty on one screen.

---

## 3. Interaction model — ambient, context-aware, actionable

- **Persistent dock, not a page.** Desktop: a toggleable right rail (~360–400px,
  below the 46px TopBar, `z:20`, beside the existing TweaksPanel). Mobile: a
  full-height bottom sheet above the BottomNav. Launch from a TopBar chat icon +
  a ⌘K command ("Ask Backbar"). State lives at the App root
  (`App.tsx`), so it survives view navigation.
- **Context-aware.** The current view and any open entity are passed as system
  context ("operator is viewing recipe *Penicillin*", "selected bottle
  *Rittenhouse Rye*"), so *"is this balanced?"* / *"what pairs with this?"* just
  work without re-specifying. Sourced from the router + store.
- **Actionable + bidirectional with the console.** Entity chips in answers open
  the existing detail overlays; "Save recipe" / "Publish" / "86 it" buttons act
  on the same objects the console shows, and the resulting bus events flow back
  through `/live` → the store → every view updates. The palette (⌘K) can hand a
  selection to the chat; the chat can trigger palette commands.
- **Trust posture.** Read-jobs stream freely. Write-jobs are **proposals the
  operator confirms** (see §7) — consistent with "AI is never trusted."

---

## 4. Chat-UX anatomy (the two differentiators)

v5 `useChat` messages are **`parts[]`**; the UI switches on `part.type`. That
maps directly onto the requested experience.

### 4a. Message stream & thinking indicators
- Top-level `status` (`submitted`/`streaming`/`ready`/`error`) drives the
  "thinking…" affordance.
- `reasoning` parts (Anthropic extended thinking; server opts in with
  `toUIMessageStreamResponse({ sendReasoning: true })`) render dimmed/italic,
  auto-collapsing when the answer starts.
- `step-start` parts mark agent steps → render as subtle dividers ("calling
  tools…" → "answer"). The sequence *thinking → calling `check_balance` →
  streaming answer* is exactly step boundaries + tool-state.

### 4b. Expandable tool-call cards
Each tool part is a **state machine** — render an expandable card that reflects it:

| state | card |
|---|---|
| `input-streaming` | collapsed chip, spinner, partial args |
| `input-available` | "Checking balance…" + the args (e.g. `daiquiri, shake`) |
| `output-available` | result rendered richly (a balance card shows the 6 axes + verdict; `top_pairings` shows ranked chips) |
| `output-error` | error chip |

Collapsed by default (one line: `✓ check_balance`), expandable to args+result.
Result renderers are tool-specific and reuse console primitives — a balance
readout reuses the radar/`Stat` look from `RecipeDetail`; pairing/similar results
render as **entity chips** (4c).

### 4c. Embedded entity references + hovercards
The marquee feature. The agent references real bottles/products/recipes; the UI
renders them as **inline chips with on-hover preview cards** and click-to-open.

- **Mechanism (recommended):** typed **data parts**. Define a Backbar `UIMessage`
  whose data parts enumerate entities — `data-entity-bottle {id}`,
  `data-entity-recipe {id,name}`, `data-entity-product {id}`. Tools/server emit
  the *reference* (id); the **client owns rendering + resolution** from the
  store. This is "AI never trusted" applied to UI: before a chip shows a
  "makeable"/"in-stock" badge, the client re-validates the id against live
  `makeable`/inventory — the model can't fake state.
- **Chip → hovercard:** reuse the portal `Tooltip` (`console/Tooltip.tsx`) for
  the hovercard body (level bar, ABV, status, "opens detail"), and on click open
  the existing `BottleDetail`/`RecipeDetail`/`ProductDetail` overlay. Tool
  outputs that already carry ids (e.g. `top_pairings`) render chips directly.
- **Inline-in-prose option:** for references *inside* a sentence (data parts
  can't interleave mid-text), a `[[recipe:penicillin]]` token + a small
  rehype plugin rewrites to `<EntityChip>`; same resolver/hovercard. Use only
  where prose-embedding matters; prefer data parts otherwise.
- **Not** `source-*` parts — those are for RAG/web citations, not domain chips.

---

## 5. Technical architecture

### Server — `POST /ai/chat` (new, streaming)
- AI-SDK v5 `streamText({ model, system, messages: convertToModelMessages(...),
  tools: buildTools(deps), stopWhen: stepCountIs(8) })` →
  `result.toUIMessageStreamResponse({ sendReasoning: true, originalMessages,
  generateMessageId, onFinish })`. For entity data parts, wrap in
  `createUIMessageStream` + `writer.merge(result.toUIMessageStream())`.
- Mounts in `aiRouter` (`routes/ai.ts`); the existing host-routing + `/api`
  strip + **auth gate run before the stream starts** (`serve.ts`), so bearer
  auth "just works." SSE is plain HTTP — no WS upgrade needed.
- System prompt = `SYSTEM_BASE` mixology teaching (`ai/prompts.ts`) + live
  inventory grounding (`inventoryLines`/`buildRefSet`) + the operator's UI
  context (§3) + tool-use guidance.
- Gateway/model: reuse `gateway.ts` (`anthropic/claude-sonnet-4` default).
- Validate `messages` with zod at the boundary (repo convention); `streamText`
  is supported by the installed `ai@5`.

### Client — `useChat` (operator-ui)
```ts
const chat = useChat<BackbarUIMessage>({
  id: threadId,
  messages: loadedThread,            // hydrate from persisted UIMessage[]
  transport: new DefaultChatTransport({
    api: "/api/chat",
    headers: () => ({ authorization: `Bearer ${getToken()}` }), // reuses operator token
  }),
});
```
Render `messages[].parts` with a `switch` (text / reasoning / step-start /
`tool-*` / `data-entity-*`). No react-query needed — `useChat` owns in-flight
state; the custom store stays the source for entity resolution.

### Mutations & live sync
The 11 tools are **read-only**. Actions take one of two shapes:
1. **Propose → confirm (default):** the agent proposes; the UI shows a confirm
   action that calls existing REST (`POST /recipes`, `PATCH /bottles`,
   `POST /menu/publish`). Those already emit bus events → `/live` → store → all
   views refresh. Keeps the human in the loop and reuses tested endpoints.
2. **Guarded write-tools (later):** e.g. `create_recipe_draft` (unpublished,
   recompute makeable, emit event) for true in-chat agency — still surfaced as a
   reviewable card. Add only after the read-only experience is solid.

### Persistence — threads (new, bun:sqlite)
- Migration `00xx_chat`: `chat_thread(id, title, created_at, updated_at)` +
  `chat_message(id, thread_id, role, parts JSON, metadata JSON, created_at)`.
- **Persist `UIMessage[]`** (never `ModelMessage[]`) — save in `onFinish` with
  `originalMessages` so the whole thread is written at once; server-generated
  ids via `generateMessageId`. On load, `validateUIMessages` to survive
  tool-schema drift. Repos in `@backbar/db`, thread routes in `routes`.

---

## 6. Components — hand-rolled vs Elements
AI-SDK **Elements** ships ready `<Tool>` (collapsible tool card) and
`<Reasoning>` components — but they're shadcn/Tailwind-utility based, and
operator-ui is **token-driven inline styles** (the dense-dark `T` palette,
`console/*` primitives; Tailwind is present but components avoid utility classes).
Dropping Elements in would fight the aesthetic. **Recommendation:** hand-build a
small chat kit on existing primitives — `ChatThread`, `MessageBubble`,
`ToolCard` (on `Cell`+`Pill`), `EntityChip` (+ `Tooltip` hovercard),
`ThinkingDots`, `ReasoningBlock` — using Elements purely as a reference for the
state→badge mapping. Keeps the console coherent and avoids a UI-kit dependency.

---

## 7. Trust & safety (AI-never-trusted, applied to actions)
- **Reads** stream freely; tool results are computed server-side over real data.
- **Writes** are operator-confirmed proposals (or guarded write-tools that still
  surface a reviewable card) — never silent.
- **Entity badges** (makeable/in-stock) are re-validated client-side against live
  state before display — the model supplies an id, not a truth claim.
- **Inventory invariant** is unchanged: any generated drink is validated against
  `makeable` (the existing repair loop / `check_makeable`) before "save" is
  offered.

---

## 8. Phased plan
**P1 — Read-only streaming chat (the foundation).** `POST /ai/chat` over
`buildTools`; the chat dock (rail + sheet) launched from TopBar/⌘K; render text +
reasoning + **tool-call cards** + **entity chips/hovercards**; context-awareness
of the current view/entity. Delivers Jobs 1 & 4 fully and the read half of 2/3/5.
*No persistence, no writes — smallest shippable first-class experience.*

**P2 — Actions + persistence.** Propose→confirm write actions (save recipe, 86,
publish menu) wired to existing REST + live sync; thread persistence
(`chat_thread`/`chat_message`) with history. Completes Jobs 2/3/5.

**P3 — Proactive & deep.** Library audit (batch `check_balance`/`classify_family`
across recipes), food-pairing flow (`score_food_pairing` + a `/ai/pair-food`
surface), batch/dilution prep math, and optional proactive nudges (low-stock →
"want substitutes?"). Optional guarded write-tools for true in-chat agency.

---

## 9. Open questions / decisions
1. **Dock vs palette-integrated** as the primary surface (recommend dock; ⌘K as a
   secondary launcher). OK?
2. **Mutation posture for P2:** propose→confirm only, or also a couple of guarded
   write-tools? (Recommend confirm-only first.)
3. **Threads:** single rolling assistant vs named/saved threads in P2? (Recommend
   one rolling thread first, named threads later.)
4. **Model:** Sonnet-4 for chat default; a cheaper model for short Q&A? Streaming
   reasoning on by default?
5. **Context scope:** how much console state to inject as system context (current
   view + selected entity is the floor; full inventory snapshot is heavier).
6. **Component kit:** confirm hand-rolled-on-`T`-tokens over importing Elements.

---

## 10. Sources
- AI SDK 5 — https://vercel.com/blog/ai-sdk-5 · Chatbot Tool Usage —
  https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-tool-usage · Transport —
  https://ai-sdk.dev/docs/ai-sdk-ui/transport · Hono API server —
  https://ai-sdk.dev/examples/api-servers/hono
- Streaming Custom Data (data parts) —
  https://ai-sdk.dev/docs/ai-sdk-ui/streaming-data · Message Persistence —
  https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-message-persistence
- Elements: Tool — https://elements.ai-sdk.dev/components/tool · Reasoning —
  https://elements.ai-sdk.dev/components/reasoning · useChat —
  https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-chat
- Backbar internals: `packages/server/src/ai/tools/*` (registry),
  `routes/ai.ts`, `serve.ts`/`auth.ts` (transport+auth), `operator-ui/src/App.tsx`,
  `store/useStore.ts`, `console/{tokens,Tooltip,Cells}.tsx`, `palette/*`.
