import { MockingUnavailableError } from "../Error";
import type { TypeLambda } from "../Extension";
import type { Initialized } from "../index";
import { augmentFunction } from "../Util";
import type {
  Established,
  ExternTestContext,
  Integration,
  Mocking,
} from "./Types";

const refuse = (): never => {
  throw new MockingUnavailableError();
};

/**
 * Built the way `mocking()` builds the real one — a callable carrying an
 * `effect` member — because a mocker missing `effect` would surface as a
 * `TypeError` on property access rather than as the error this exists to
 * raise. `Spyable.ForEffect.Interface` is `{ named }` alone (`Spy.ts`), so
 * refusing there covers the whole effect surface.
 *
 * One shared value: it holds no state, and nothing about it varies per
 * instance.
 */
const refusal: Mocking = {
  mock: augmentFunction(refuse, { effect: { named: refuse } }),
};

/**
 * Cast, for the same reason `Mocking.ts`'s own cast exists: `$Lambda` is
 * phantom throughout, and no runtime value differs between one instantiation
 * and another — least of all here, where every path out is a throw.
 */
const unavailable = <$Lambda extends TypeLambda>(): Mocking<$Lambda> =>
  refusal as unknown as Mocking<$Lambda>;

/**
 * Decorate an initialized instance as a `@ghostry/harness` integration — `{
 * name, provides, frame }`. Every test body then runs inside one
 * `extern.testing` block, and `context.extern.mock` is that block's mocker.
 *
 * Takes an instance rather than minting one: `initialize` is async and its
 * configuration — the scope carrier, the extensions — is the caller's.
 *
 * **Tests are framed; suite hooks are not.** A `beforeAll` runs outside any
 * block, so an extern block reached from one runs its original function,
 * exactly as it would with no integration installed. Framing it would instead
 * hand the hook a block whose mocks die with it — each block mints its own
 * spies, so nothing defined there could ever reach a test — and would fire
 * `UnusedMocksError` out of a `beforeAll` for the trouble.
 *
 * `provides.extern` therefore hands back a stand-in that refuses on use. A
 * throwing *provider* is not an option: harness runs every provider eagerly on
 * every framed invocation, touched or not, so one would fail every suite hook
 * in the suite rather than only the hooks that reach for a mocker.
 *
 * `beforeEach`/`afterEach` are not separately framed — harness runs them inside
 * the innermost wrapper, around the body — so a mock defined in `beforeEach` is
 * live for the test, and `afterEach` can still read its spies.
 *
 * `$Lambda` defaults to `never` rather than falling back to its constraint. A
 * `TypeLambda` fallback would quietly accept any identity at all, where `never`
 * fails at the caller's own `mock(...)` line — inference through
 * `Initialized<$Lambda>` is positional and does not descend into `Mocker`, but
 * the default is what makes the failure mode safe if it ever did.
 */
export function integration<$Lambda extends TypeLambda = never>(
  instance: Initialized<$Lambda>,
): Integration<ExternTestContext<$Lambda>, Established<$Lambda>> {
  return {
    name: "@ghostry/extern",

    provides: {
      extern: ({ established: instance }) => instance ?? unavailable<$Lambda>(),
    },

    /**
     * Synchronous, and returns without yielding for a suite. A frame closed on
     * its first `next()` establishes nothing and is never resumed, which is
     * harness's own encoding for "this invocation is not mine to wrap" — a
     * bracketing `yield` would buy nothing here and route a failing hook
     * through a teardown path with nothing in it.
     */
    *frame({ identity }) {
      if (identity.kind === "suite") return;

      yield (body) => instance.testing((mock) => body({ mock }));
    },
  };
}
