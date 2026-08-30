import type { Produce } from "./Extension";
import type { IdentityMap } from "./Spy";
import type { AnyIdentity } from "./Types";

export interface Context {
  readonly spies: IdentityMap;

  /**
   * Routes to whichever configured extension claims a given identity — set
   * once, synchronously, before this context is ever handed to
   * `config.scope.run`, so it is always present by the time any test code (or
   * a producible block reached from it) can read it. Absent only when no
   * extension was configured at all; present, but claiming nothing, when the
   * configured extensions all decline to produce.
   */
  produce?: Produce;

  /**
   * Per-block production cache, keyed outer by `identity` (a generic helper
   * wrapping `by()` can serve several schemas from one block, so the identity
   * must stay in the key) and inner by `named ?? ""`.
   *
   * Load-bearing, not an optimization. An extension is free to derive a value
   * from state that advances per construction — a seeded stream's ordinal,
   * say — in which case asking it twice for the same identity yields two
   * different values. This cache is what makes reading the same block twice
   * within one test agree.
   */
  readonly productions: Map<AnyIdentity, Map<string, unknown>>;
}
