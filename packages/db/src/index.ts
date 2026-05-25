// @backbar/db — bun:sqlite client, migrations, repositories, canon seed.
// See specs/data-model.md §1 + §5 for the contract.

export { open, openMemory, type DB } from "./client";
export {
  migrate,
  rebuildLevels,
  appliedVersions,
  MIGRATIONS_DIR,
  type Applied,
} from "./migrations";
export { uuidv7 } from "./ids";
export {
  products,
  productTags,
  bottles,
  readings,
  recipes,
  pours,
  sensorChannels,
  nodes,
  queries,
  type PourApplyInput,
  type PourApplyResult,
} from "./repositories";
export {
  seed,
  CANON_RECIPES,
  CANON_PRODUCTS,
  STARTER_BOTTLES,
  DENSITY_BY_CATEGORY,
  type SeedReport,
} from "./seed";
