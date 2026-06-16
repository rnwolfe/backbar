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
  categories,
  featureFlags,
  products,
  productTags,
  bottles,
  readings,
  recipes,
  pours,
  sensorChannels,
  nodes,
  queries,
  flavorProfiles,
  flavorPairings,
  ingredientSubstitutes,
  rootTemplates,
  type FeatureFlagOverride,
  type PourApplyInput,
  type PourApplyResult,
} from "./repositories";
export { seedFlavor, deriveCooccurrence, type FlavorSeedReport } from "./seedFlavor";
export { FLAVOR_PROFILES } from "../seed/flavor/profiles";
export { SUBSTITUTES } from "../seed/flavor/substitutes";
export {
  seed,
  seedReference,
  seedFixtures,
  CANON_RECIPES,
  CANON_PRODUCTS,
  STARTER_BOTTLES,
  STARTER_CATEGORIES,
  DENSITY_BY_CATEGORY,
  type SeedReport,
  type ReferenceReport,
  type FixturesReport,
} from "./seed";
