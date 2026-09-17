/**
 * The `@ghostry/extern/harnessing` package export — what supplying a
 * `@ghostry/harness` integration is built from. Named for the activity, the
 * same pattern `@ghostry/fabricator/harnessing` follows.
 *
 * Deliberately separate from the `.` export: `.` is for using extern, and this
 * is the contract a test-framework wrapping library drives. Extern declares no
 * dependency and no peer on `@ghostry/harness`; the types here describe the
 * part of that package's contract this integration uses, satisfied
 * structurally, so neither depends on the other.
 *
 * **Mirrors the integration contract of `@ghostry/harness` 0.0.4.** Structural
 * satisfaction is what keeps the two packages independent, and it is also what
 * leaves nothing to check the pairing at install time: neither manifest names
 * the other, so a mismatched pair is caught by `tsc` at the point a consumer
 * passes `integration(extern)` to `initialize`, with an error about shapes
 * rather than about versions. This line is the only record of which version the
 * copy tracks, so move it whenever that contract does — `Harnessing/Types.ts`
 * is where the drift actually lives.
 *
 * Note what is *not* re-exported here. `Frame` and `Wrapper` name harness's
 * generator contract, and extern's `.` export already uses both names for its
 * own extension frames; `Identity` is harness's test identity, where extern's
 * `Identity` is a block's schema. Reach for them through
 * `Harnessing/Types.ts`'s own names if you need them.
 *
 * @module
 */

/**
 * Decorate an initialized instance as a `@ghostry/harness` integration — `{
 * name, provides, frame }` — so every test body runs inside one
 * `extern.testing` block and `context.extern.mock` is that block's mocker.
 * Suite hooks are deliberately left unframed.
 */
export { integration } from "./Harnessing/Core.ts";

/**
 * Thrown when `context.extern.mock` is reached from a suite hook, which runs
 * outside any testing block. Also exported from `.`, where every other error
 * class lives.
 */
export { MockingUnavailableError } from "./Error.ts";

/**
 * `Integration` is the `{ name, provides, frame }` shape `integration(extern)`
 * returns — `provides` is a `Provides<$Context, $Established>`, one `Provider`
 * per context key, each handed what the frame's wrapper established;
 * `ExternTestContext` is the `{ extern }` slice of the test context this
 * integration contributes, and `Mocking` is what that key holds; `Established`
 * is what the wrapper passes forward, `undefined` on the suite path this
 * integration does not frame.
 */
export type {
  Established,
  ExternTestContext,
  Integration,
  Mocking,
  Provider,
  ProviderArgs,
  Provides,
} from "./Harnessing/Types.ts";
