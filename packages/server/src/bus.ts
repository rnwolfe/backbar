/**
 * Typed in-process event bus for WS broadcast + webhook fan-out.
 *
 * Producers (ingest core, route handlers) call `emit`; consumers
 * (`/live` WebSocket, webhook adapter) subscribe via `on`. Listeners
 * run synchronously inside emit — keep them cheap; defer IO to the
 * subscriber's own queue.
 */

export type LiveEvent =
  | { type: "reading.updated"; bottle_id: string; level_ml: number; source: "manual" | "weight" | "pour"; ts: number }
  | { type: "makeable.changed"; recipe_id: string; state: "makeable" | "one-away" | "unmakeable" }
  | { type: "node.status"; device_id: string; status: "online" | "offline"; last_seen: number | null }
  | { type: "lowstock.crossed"; bottle_id: string; level_ml: number };

export type Listener = (e: LiveEvent) => void;

export class Bus {
  private listeners = new Set<Listener>();

  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(e: LiveEvent): void {
    for (const fn of this.listeners) {
      try {
        fn(e);
      } catch (err) {
        console.error("[bus] listener threw", err);
      }
    }
  }
}
