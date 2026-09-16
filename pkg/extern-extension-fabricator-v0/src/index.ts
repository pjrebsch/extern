import type { Extension, Session } from "@ghostry/extern";
import { initialize, layer } from "@ghostry/fabricator";
import { Kind, Meta, type Buildable } from "@ghostry/fabricator/internal";
import type { FabricatorLambda } from "./Types";

export type { Built, FabricatorLambda, HandleFor, Schema } from "./Types";

/**
 * A `@ghostry/fabricator` instance from its own `initialize()` call.
 *
 * Read off that declaration rather than written out here. Fabricator does not
 * export its `Instance` type by name, and a hand-written structural stand-in
 * would be a second copy of a contract this package has no business owning:
 * it would drift, and it would silently keep compiling once it had.
 */
export type Instance = ReturnType<typeof initialize>;

/**
 * True for a raw fabricator Schema or a built Fabricator — anything a block
 * can construct a value from. Every kind's Schema and every built Fabricator
 * carries both brands, unlike anything else that extern's `Identity` covers.
 */
const supports = (identity: unknown): boolean =>
  typeof identity === "object"
  && identity !== null
  && Kind in identity
  && Meta in identity;

/**
 * A deliberately foreknown constant, layered onto the salt by every testing
 * block's scope.
 */
const SCOPE_SALT = "@ghostry/extern";

export interface Configuration {
  /** A `@ghostry/fabricator` instance — the result of its `initialize()`. */
  readonly instance: Instance;

  /**
   * What a block built from a fabricator schema does when it has no matching
   * mock.
   *
   * @default "produce"
   */
  readonly unmocked?: "produce" | "error";
}

/**
 * Make this extern instance accept `@ghostry/fabricator` schemas as block
 * identities.
 *
 * ```ts
 * const extern = await initialize({
 *   extensions: [fabricatorExtension({ instance: fabricator })],
 * });
 * ```
 *
 * An unmocked `typed` block built from a schema then fabricates its value
 * instead of throwing; `mock(schema).with(v)` still overrides outright, and
 * `mock(schema).produce(({ via }) => via.fabricate({ name: "Ada" }))` shapes
 * the fabrication through fabricator's own API.
 *
 * **Requires an async stack carrier** only for async testing bodies, which is
 * every runtime with `node:async_hooks` — Bun, Node, and Deno. This extension
 * runs the testing block inside fabricator's `wrap`, which refuses an async
 * block under the synchronous carrier a browser bundle selects. A sync body
 * works under that carrier too.
 */
export const fabricatorExtension = (
  config: Configuration,
): Extension<FabricatorLambda> => ({
  kind: "producer",

  name: "fabricator",

  supports,

  ...(config.unmocked === undefined ? {} : { unmocked: config.unmocked }),

  *frame() {
    /**
     * `wrap`, not `fork`: it opens an ambient frame as well as handing back a
     * scoped instance, so a user's own `new fabricator.Fabricator(...)`
     * written directly in the test resolves against the very same source as the
     * blocks around it.
     *
     * {@link SCOPE_SALT} is what keeps a block's draws distinct from those of
     * the scope enclosing it. Every `wrap` re-instantiates, so a block's
     * ordinals restart at zero — and with the enclosing salt inherited
     * unchanged, the two sources would be identically seeded. The *n*th
     * fabrication of a schema inside the block would then equal the *n*th
     * outside it, at every ordinal rather than merely the first.
     *
     * Everything else the enclosing configuration carries inherits untouched,
     * a harness's per-test salt above all.
     *
     * `context.scope()`, not `config.instance`, is what makes that inheritance
     * happen. A plain `wrap` lays its overlay over the instance it was called
     * on, and this receiver is bound outside whatever block is running — so it
     * would restate from the configured instance and drop an enclosing scope
     * entirely, silently. `context.scope()` is the frame in effect, or the
     * instance itself when there is none, which is this extension's contract in
     * both cases with no branch. Called fresh here rather than hoisted:
     * fabricator makes `scope` a function so that capturing it captures the
     * lookup, where a captured result would otherwise pin one frame.
     */
    yield (body) =>
      config.instance.context
        .scope()
        .wrap({ salt: layer([SCOPE_SALT]) }, (scoped) => body(session(scoped)));
  },
});

const session = (instance: Instance): Session.Producer => ({
  produce: (identity, named, using) => {
    /**
     * `as Buildable`, not `as never`: the identity is `unknown` to extern, so
     * nothing here can name its schema type, but `never` would collapse the
     * constructor's return with it. `Buildable` is the widest thing fabricator
     * itself will build, which keeps `fabricate` reachable on the result.
     */
    const built = new instance.Fabricator(identity as Buildable, {
      /**
       * `ordinal: null` alongside the salt, not the salt alone. Fabricator
       * documents a salt as a *pin* rather than a fork — "a salted build takes
       * the next ordinal exactly as an unsalted one does" — so layering the
       * name on its own leaves the source's construction counter in the trace,
       * and a named block's value still shifts with whatever was built before
       * it. `null` is fabricator's own encoding for a build that deliberately
       * takes no ordinal, which is exactly what a name asserts: this block is
       * identified by what it is called, not by where it fell in the scope.
       *
       * Unnamed blocks keep the counter. Construction order is the only thing
       * left to tell two of them apart.
       */
      ...(named === undefined ? {} : { salt: layer([named]), ordinal: null }),
    });

    /**
     * The handle *is* the built Fabricator. Only this package can construct
     * one, which is why extern routes the caller's callback here rather than
     * invoking it itself — and why shaping a fabrication is expressed in
     * fabricator's own `fabricate(overrides)` vocabulary rather than anything
     * extern models.
     */
    return using === undefined ? built.fabricate() : using(built);
  },
});
