import type { Extension, Session } from "@ghostry/extern";
import { initialize, layer } from "@ghostry/fabricator";
import {
  Kind,
  Meta,
  resolveCallerFile,
  type Buildable,
} from "@ghostry/fabricator/internal";
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
 * This package's own source root — `src/` in this repo's tests, `dist/esm/`
 * once built.
 *
 * Skipped *in addition to* the roots extern hands over, never instead of
 * them. The stack a fabrication sees reads
 * fabricator -> this package -> extern -> the user's test, so a walk that
 * passes over only fabricator's own frames (which fabricator always does) and
 * this package's stops inside extern's core instead of reaching the test.
 */
const OWN_ROOT = new URL(".", import.meta.url).href;

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
 * The file that called into extern, expressed relative to the *instance's own
 * resolved attribution root* — mirroring what fabricator computes for an
 * unmediated construction, but through a walk that also passes over extern's
 * frames and this package's.
 *
 * `undefined` under `{ kind: "none" }` attribution, matching fabricator's own
 * short-circuit: the user has opted out of file attribution, so this pins no
 * file and seeds by none — landing in the same file-less bucket an unpinned
 * construction would, rather than diverging from it.
 */
const attributedCallerFile = (
  instance: Instance,
  ignore: readonly string[],
): string | undefined => {
  const attribution = instance.context.attribution;

  return "root" in attribution ?
      resolveCallerFile({ skip: [...ignore, OWN_ROOT], root: attribution.root })
    : undefined;
};

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
 * **Requires an async stack carrier**, which is every runtime with
 * `node:async_hooks` — Bun, Node, and Deno. Extern's testing block is
 * inherently asynchronous and this extension runs it inside fabricator's
 * `wrap`, which refuses an async block under the synchronous carrier a browser
 * bundle selects.
 */
export const fabricatorExtension = (
  config: Configuration,
): Extension<FabricatorLambda> => ({
  kind: "producer",

  name: "fabricator",

  supports,

  ...(config.unmocked === undefined ? {} : { unmocked: config.unmocked }),

  scope: (options, block) => {
    const site = attributedCallerFile(config.instance, options.ignore);

    /**
     * `wrap`, not `fork`: it opens an ambient frame as well as handing back a
     * scoped instance, so a user's own `new fabricator.Fabricator(...)`
     * written directly in the test resolves against the very same seed as the
     * blocks around it.
     *
     * The overlay carries a seed layer and nothing else — `attribution` is
     * deliberately not overridden, so whatever policy the user gave their own
     * `initialize()` stays in force. `site` is stripped of `:line:col`, so the
     * layer is per-*file*: reordering or inserting testing blocks within a
     * file never perturbs another block's data.
     */
    return config.instance.wrap(
      site === undefined ? {} : { seed: layer([site]) },
      (scoped) => block(session(scoped, options.ignore)),
    );
  },
});

const session = (
  instance: Instance,
  ignore: readonly string[],
): Session.Producer => ({
  produce: (identity, named, using) => {
    /**
     * Pinned explicitly, computed fresh for *this* construction, rather than
     * left to fabricator's own default attribution. Fabricator's live stack
     * walk knows to pass over its own frames, not this package's or extern's,
     * so left alone it would attribute the fabrication to this file instead of
     * to whichever file actually wrote the `by(...).will(...)` call.
     *
     * Because it relativizes against the same root fabricator itself uses,
     * this and an ambient, unpinned construction in the same test resolve the
     * identical string — which is what makes the two agree.
     */
    const file = attributedCallerFile(instance, ignore);

    /**
     * `as Buildable`, not `as never`: the identity is `unknown` to extern, so
     * nothing here can name its schema type, but `never` would collapse the
     * constructor's return with it. `Buildable` is the widest thing fabricator
     * itself will build, which keeps `fabricate` reachable on the result.
     */
    const built = new instance.Fabricator(identity as Buildable, {
      ...(file === undefined ? {} : { file }),
      ...(named === undefined ? {} : { seed: layer([named]) }),
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
