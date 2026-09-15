import { initialize as initializeExtern } from "@ghostry/extern";
import { initialize as initializeFabricator } from "@ghostry/fabricator";
import { integration, type Identity } from "@ghostry/fabricator/harnessing";
import { describe, expect, it } from "bun:test";
import { fabricatorExtension } from "../src";

/**
 * What happens when this extension's `wrap` runs *inside* the `wrap` that
 * `@ghostry/fabricator/harnessing` opens per test — the arrangement a user gets
 * from combining extern, fabricator, and `@ghostry/harness`.
 *
 * The harness package itself is not a dependency here, and does not need to be:
 * `integration(instance)` is satisfied structurally, and driving its `around`
 * directly is exactly what a harness does with it. Standing it up by hand also
 * keeps this file honest about which package owns which half of the behavior.
 */

const fabricator = initializeFabricator({ salt: "harnessing-suite" });
const { T } = fabricator;

type Id = { id: number };
const schema = T.object({ id: T.number });

const extern = await initializeExtern({
  scope: "async",
  extensions: [fabricatorExtension({ instance: fabricator })],
});

const block = (): Id =>
  extern.typed.by(schema).will((): Id => {
    throw new Error("unreachable");
  });

const harness = integration(fabricator);

/** One test's worth of `around`, named the way a harness would name it. */
const asTest = <$Return>(
  name: string,
  body: (identity: Identity) => $Return,
): $Return => {
  const identity: Identity = {
    kind: "test",
    path: ["harnessing"],
    name,
    row: undefined,
  };

  return harness.around(identity, () => body(identity));
};

function isThenable(value: unknown): value is PromiseLike<unknown> {
  if (typeof value !== "object" || value === null) return false;
  return typeof (value as PromiseLike<unknown>).then === "function";
}

describe("under a harness `around`", () => {
  it("returns a non-thenable for a sync body under `around`", () => {
    let value: Id | undefined;

    const result = asTest("sync", () =>
      extern.testing(() => void (value = block())),
    );

    expect(isThenable(result)).toBe(false);
    expect(value).toBeDefined();
  });

  /**
   * The whole point of the harness integration, and the thing that would be
   * silently lost if this extension's `wrap` laid its overlay over the base
   * instance rather than over the active frame.
   */
  it("inherits the enclosing test's salt into extern blocks", async () => {
    let alpha: Id | undefined;
    let beta: Id | undefined;

    await asTest("alpha", async () => {
      await extern.testing(() => void (alpha = block()));
    });

    await asTest("beta", async () => {
      await extern.testing(() => void (beta = block()));
    });

    expect(alpha).toBeDefined();
    expect(alpha).not.toEqual(beta!);
  });

  it("reproduces one identity's value across runs", async () => {
    const run = async (): Promise<Id> => {
      let value: Id | undefined;

      await asTest("stable", async () => {
        await extern.testing(() => void (value = block()));
      });

      return value!;
    };

    expect(await run()).toEqual(await run());
  });

  /**
   * Every `wrap` re-instantiates, so a block's ordinals restart at zero. Were
   * the enclosing salt inherited untouched, the block's source and the
   * enclosing one would be identically seeded — and the *n*th fabrication of a
   * schema inside the block would equal the *n*th outside it, at every ordinal
   * rather than merely the first. The scope's own salt layer is what rules
   * that out, so this asserts the whole run is disjoint and not just its head.
   */
  it("never collides with the enclosing scope's own draws", async () => {
    const draws = (count: number): ReadonlyArray<Id> =>
      Array.from({ length: count }, () =>
        new fabricator.Fabricator(schema).fabricate(),
      );

    await asTest("ordinals", async () => {
      const outer = draws(4);

      await extern.testing(() => {
        for (const value of draws(4)) {
          expect(outer).not.toContainEqual(value);
        }
      });
    });
  });

  /**
   * `provides.fabricator` hands back the *harness's* scope, not the one this
   * extension opened inside it. That handle does not go stale: fabricator
   * resolves a construction against the innermost active frame, so the provided
   * instance and the ambient one draw from a single source inside the block.
   *
   * Were they not sharing — were the provided scope still building from its own
   * source — each of these would be that source's ordinal zero, and they would
   * be equal. Their *inequality* is what pins the sharing down.
   */
  it("keeps the provided scope in step with the block's own source", async () => {
    await asTest("provided", async (identity) => {
      const provided = harness.provides.fabricator(identity);

      await extern.testing(() => {
        const viaProvided = new provided.Fabricator(schema).fabricate();
        const viaBase = new fabricator.Fabricator(schema).fabricate();

        expect(viaProvided).not.toEqual(viaBase);
      });
    });
  });

  it("restores the enclosing frame once the block has run", async () => {
    await asTest("restoration", async () => {
      const before = fabricator.context.salt;

      await extern.testing(() => void block());

      expect(fabricator.context.salt).toEqual(before);
    });
  });
});

describe("across two `initialize()` lineages", () => {
  /**
   * The ambient stack is created once per root `initialize()` and threaded
   * through every `fork`/`wrap` descended from it, so two roots never see each
   * other's frames. An extension pointed at a second instance therefore lays
   * its overlay over that instance's own config, and the harness's per-test
   * salt never reaches it — every test fabricates identically, with nothing
   * raised to say so.
   *
   * Pinned as the failure it is. The fix is to hand both halves one instance,
   * or a `fork()` of it.
   */
  it("silently drops the per-test salt", async () => {
    const detached = initializeFabricator({ salt: "detached" });

    const other = await initializeExtern({
      scope: "async",
      extensions: [fabricatorExtension({ instance: detached })],
    });

    const detachedBlock = (): Id =>
      other.typed.by(schema).will((): Id => {
        throw new Error("unreachable");
      });

    let alpha: Id | undefined;
    let beta: Id | undefined;

    await asTest("alpha", async () => {
      await other.testing(() => void (alpha = detachedBlock()));
    });

    await asTest("beta", async () => {
      await other.testing(() => void (beta = detachedBlock()));
    });

    expect(alpha).toEqual(beta!);
  });

  /**
   * A `fork` shares its parent's stack, so it stays inside the lineage and the
   * per-test salt still reaches it.
   */
  it("keeps the per-test salt through a `fork`", async () => {
    const forked = await initializeExtern({
      scope: "async",
      extensions: [fabricatorExtension({ instance: fabricator.fork() })],
    });

    const forkedBlock = (): Id =>
      forked.typed.by(schema).will((): Id => {
        throw new Error("unreachable");
      });

    let alpha: Id | undefined;
    let beta: Id | undefined;

    await asTest("alpha", async () => {
      await forked.testing(() => void (alpha = forkedBlock()));
    });

    await asTest("beta", async () => {
      await forked.testing(() => void (beta = forkedBlock()));
    });

    expect(alpha).toBeDefined();
    expect(alpha).not.toEqual(beta!);
  });
});
