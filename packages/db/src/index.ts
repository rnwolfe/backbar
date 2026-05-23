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
  bottles,
  readings,
  recipes,
  pours,
  sensorChannels,
  nodes,
  queries,
} from "./repositories";
export { seed, CANON_RECIPES, DENSITY_BY_CATEGORY, type SeedReport } from "./seed";
