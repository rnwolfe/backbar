/**
 * va-abc — Virginia ABC local stock & price (procurement integration, spec §10).
 * Public surface: the `ProcurementSource` contract + the va-abc factory. The
 * `VaAbcClient` is exported for tests; app code should depend only on
 * `ProcurementSource`. See ./CONTRACT.md for the pinned upstream contract.
 */
export {
  createVaAbcSource,
  type ProcurementSource,
  type ProcurementProduct,
  type LocalStock,
  type LocalStore,
  type VaAbcSourceOptions,
} from "./source";

export { VaAbcClient, VaAbcError, DEFAULT_BASE_URL, type VaAbcClientOptions } from "./client";
