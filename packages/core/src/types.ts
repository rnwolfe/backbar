// Re-export the inferred TS types so consumers can `import type { Bottle } from "@backbar/core/types"`
// without pulling in Zod at the call site.
export type {
  Product,
  Bottle,
  Reading,
  Recipe,
  RecipeIngredient,
  Pour,
  PourBinding,
  SensorChannel,
  Node,
  Balance,
  ManualReading,
  WeightReading,
  Source,
  Status,
  RefType,
  Unit,
  Method,
  RecipeSource,
  NodeStatus,
} from "./schema";

export type {
  InvBottle,
  Binding,
  Result,
  MakeabilityState,
  BindingPolicy,
} from "./makeability";

export type { BalanceIngredient, BalanceFlags } from "./balance";
