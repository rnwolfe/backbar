import type { UIMessage } from "ai";

/** Context the dock passes so "is this balanced?" works without re-stating. */
export interface ChatContext {
  view?: string;
  entity?: { kind: string; id: string; label?: string };
}

export type EntityKind = "bottle" | "product" | "recipe";

export type BackbarUIMessage = UIMessage;

/** Inline entity reference the agent emits as `[[kind:id]]`. */
export interface EntityRef {
  kind: EntityKind;
  id: string;
}
