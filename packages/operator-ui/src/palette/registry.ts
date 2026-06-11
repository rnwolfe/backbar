import type { Node as NodeRow, Product, Recipe } from "@backbar/core";
import type { BottleWithProduct, MakeableItem } from "../api/client";
import type { AppStore, ViewKey } from "../store/useStore";

export type ArgKind = "bottle" | "recipe" | "product" | "node";

export type CommandGroup = "nav" | "inventory" | "recipe" | "ai" | "fleet" | "menu";

export type EntityKind = "product" | "bottle" | "recipe" | "node";

export type Entity =
  | { kind: "product"; value: Product }
  | { kind: "bottle"; value: BottleWithProduct }
  | { kind: "recipe"; value: Recipe & { makeable?: MakeableItem } }
  | { kind: "node"; value: NodeRow };

export interface AppCtx {
  store: AppStore;
  nav(view: ViewKey): void;
  palette: {
    close(): void;
    pushPourConfirm(recipe: Recipe & { makeable?: MakeableItem }): void;
    toast(text: string): void;
    openBulkImportInventory?(): void;
  };
}

export interface Command {
  id: string;
  title: string;
  group: CommandGroup;
  keywords?: string[];
  icon?: string;
  argKind?: ArgKind;
  /**
   * If set, the command is hidden from the palette unless the named flag is
   * currently enabled. Resolved at palette render time; toggling the flag
   * makes the command appear/disappear without a reload.
   */
  requiresFlag?: string;
  run(ctx: AppCtx, arg?: Entity): void | Promise<void>;
}

const commands: Command[] = [];

export function register(cmd: Command) {
  // Idempotent — calling twice (HMR, repeated imports) overwrites by id.
  const i = commands.findIndex((c) => c.id === cmd.id);
  if (i >= 0) commands[i] = cmd;
  else commands.push(cmd);
}

export function registerMany(cmds: Command[]) {
  for (const c of cmds) register(c);
}

export function listCommands(): readonly Command[] {
  return commands;
}
