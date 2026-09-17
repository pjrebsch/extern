import { initialize as initializeExtern } from "@ghostry/extern";
import {
  integration as externIntegration,
  type ExternTestContext,
} from "@ghostry/extern/harnessing";
import { initialize as initializeFabricator, layer } from "@ghostry/fabricator";
import {
  integration,
  type FabricatorTestContext,
} from "@ghostry/fabricator/harnessing";
import {
  initialize as initializeHarness,
  type Framework,
} from "@ghostry/harness";
import { describe, expect, it } from "bun:test";
import { fabricatorExtension, type FabricatorLambda } from "../src";

/**
 * What happens when this extension's `wrap` runs *inside* the `wrap` that
 * `@ghostry/fabricator/harnessing` opens per test — the arrangement a user gets
 * from combining extern, fabricator, and `@ghostry/harness`.
 *
 * Driven through the **real** `@ghostry/harness` rather than a stand-in for it.
 * The cost, stated plainly: a failure here can now originate in three packages
 * rather than two. What is asserted is still extern's and fabricator's doing —
 * salt inheritance, ordinal disjointness, frame restoration — so a harness bug
 * is unlikely to counterfeit one of these convincingly, but it is no longer
 * impossible.
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

/**
 * Every body harness composed, in registration order. A runner would run these;
 * {@link asTest} invokes one directly so its return value stays inspectable,
 * which is what lets the synchronous case below assert that nothing in the
 * chain promoted it to a promise.
 */
const registered: Array<{ readonly name: string; readonly fn: () => unknown }> =
  [];

/**
 * The slice of a test framework harness wraps. A recording stand-in satisfies
 * it structurally, exactly as `bun:test` and vitest do.
 */
const framework = {
  describe: (_name: string, fn: () => unknown) => fn(),
  it: (name: string, fn: () => unknown) => void registered.push({ name, fn }),
  test: (name: string, fn: () => unknown) => void registered.push({ name, fn }),
  expect,
  beforeAll: () => {},
  afterAll: () => {},
} satisfies Framework;

const harnessed = initializeHarness({
  framework,
  integrations: [integration(fabricator)],
});

/**
 * What the integration contributes, read off the instance rather than restated:
 * `provides.fabricator` hands back the scope its own wrapper established.
 */
type Context = { readonly fabricator: typeof fabricator };

/**
 * Register one test with harness and run it, handing back whatever its body
 * returned. The identity harness derives — and therefore the per-test salt —
 * comes from the name, so distinct names here are what make the tests below
 * distinct.
 */
const asTest = <$Return>(
  name: string,
  body: (context: Context) => $Return,
): $Return => {
  const before = registered.length;

  harnessed.it(name, body);

  const added = registered[before];
  if (added === undefined)
    throw new Error(`\`it(${name})\` registered nothing`);

  return added.fn() as $Return;
};

function isThenable(value: unknown): value is PromiseLike<unknown> {
  if (typeof value !== "object" || value === null) return false;
  return typeof (value as PromiseLike<unknown>).then === "function";
}

describe("under a harness frame", () => {
  it("returns a non-thenable for a sync body", () => {
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
    await asTest("provided", async (context) => {
      const provided = context.fabricator;

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

describe("handing the two halves different instances", () => {
  /**
   * An extern instance whose fabricator extension is pointed at `instance`,
   * and a block built through it.
   */
  const extendedWith = async (instance: typeof fabricator) => {
    const extended = await initializeExtern({
      scope: "async",
      extensions: [fabricatorExtension({ instance })],
    });

    const extendedBlock = (): Id =>
      extended.typed.by(schema).will((): Id => {
        throw new Error("unreachable");
      });

    return { extended, extendedBlock };
  };

  /**
   * The ambient stack is created once per root `initialize()` and threaded
   * through every `fork`/`wrap` descended from it, so two roots never see each
   * other's frames. An extension pointed at a second instance therefore lays
   * its overlay over that instance's own config, and the harness's per-test
   * salt never reaches it — every test fabricates identically, with nothing
   * raised to say so.
   *
   * Pinned as the failure it is.
   */
  it("silently drops the per-test salt across two lineages", async () => {
    const { extended, extendedBlock } = await extendedWith(
      initializeFabricator({ salt: "detached" }),
    );

    let alpha: Id | undefined;
    let beta: Id | undefined;

    await asTest("alpha", async () => {
      await extended.testing(() => void (alpha = extendedBlock()));
    });

    await asTest("beta", async () => {
      await extended.testing(() => void (beta = extendedBlock()));
    });

    expect(alpha).toEqual(beta!);
  });

  /**
   * One lineage is not enough. The per-test `wrap` governs the instance handed
   * to `integration(...)` and its ancestors, never a fork of it, so an
   * extension pointed at a fork lays its overlay over the fork's own config —
   * the same silent failure as two lineages, and one `root` cannot catch, since
   * the fork shares it.
   */
  it("silently drops the per-test salt when the extension is handed a fork of the integrated instance", async () => {
    const { extended, extendedBlock } = await extendedWith(fabricator.fork());

    let alpha: Id | undefined;
    let beta: Id | undefined;

    await asTest("alpha", async () => {
      await extended.testing(() => void (alpha = extendedBlock()));
    });

    await asTest("beta", async () => {
      await extended.testing(() => void (beta = extendedBlock()));
    });

    expect(alpha).toEqual(beta!);
  });

  /**
   * The working direction: the integration handed a fork, the extension its
   * parent. The extension's instance is an ancestor of the one the per-test
   * `wrap` is entered on, so that wrap governs it.
   */
  it("keeps the per-test salt when the integration is handed a fork of the extension's instance", async () => {
    const { extended, extendedBlock } = await extendedWith(fabricator);

    const forkHarnessed = initializeHarness({
      framework,
      integrations: [integration(fabricator.fork())],
    });

    const drawn = async (name: string) => {
      const before = registered.length;
      let value: Id | undefined;

      forkHarnessed.it(name, async () => {
        await extended.testing(() => void (value = extendedBlock()));
      });

      await registered[before]!.fn();
      return value;
    };

    const alpha = await drawn("alpha");
    const beta = await drawn("beta");

    expect(alpha).toBeDefined();
    expect(alpha).not.toEqual(beta!);
  });
});

/**
 * All three libraries at once, each through its own integration: harness frames
 * every test, fabricator salts that frame per test, and extern's integration
 * opens a testing block inside it — so a block fabricates per-test data with no
 * `extern.testing` written anywhere.
 *
 * A pinned clock throughout: these build several instances and compare what
 * they draw, and the unconfigured default is the wall-clock instant of each
 * `initialize()` call.
 */
describe("composed with extern's own harness integration", () => {
  const CLOCK = new Date("2024-01-01T00:00:00.000Z");

  /** What the two integrations contribute between them, merged as harness merges it. */
  type Composed = Readonly<
    FabricatorTestContext & ExternTestContext<FabricatorLambda>
  >;

  /**
   * One three-way arrangement. `order` is the whole variable: `"extern-last"`
   * is the order the READMEs' examples use, and `"extern-first"` is the same
   * list reversed.
   */
  const arrange = async (order: "extern-last" | "extern-first") => {
    const instance = initializeFabricator({ salt: "three-way", clock: CLOCK });

    const composed = await initializeExtern({
      scope: "async",
      extensions: [fabricatorExtension({ instance })],
    });

    const fabricated = (): Id =>
      composed.typed.by(schema).will((): Id => {
        throw new Error("unreachable");
      });

    const integrations =
      order === "extern-last" ?
        [integration(instance), externIntegration(composed)]
      : [externIntegration(composed), integration(instance)];

    const harnessed = initializeHarness({ framework, integrations });

    /** {@link asTest}, against this arrangement's own harness. */
    const inTest = <$Return>(
      name: string,
      body: (context: Composed) => $Return,
    ): $Return => {
      const before = registered.length;

      harnessed.it(name, body);

      const added = registered[before];
      if (added === undefined)
        throw new Error(`\`it(${name})\` registered nothing`);

      return added.fn() as $Return;
    };

    return { instance, composed, fabricated, inTest };
  };

  /**
   * The arrangement's whole point: no `extern.testing` anywhere, and blocks
   * still fabricate data that is this test's alone and reproducible.
   */
  it("gives each test its own data through a block, with no testing call", async () => {
    const { fabricated, inTest } = await arrange("extern-last");

    const drawn = (name: string) => inTest(name, () => fabricated());

    const alpha = drawn("alpha");
    const beta = drawn("beta");

    expect(alpha).not.toEqual(beta);
    expect(drawn("alpha")).toEqual(alpha);
  });

  /**
   * Order changes the order of the salt layers and nothing else. Asserted on
   * the composed salt rather than on opaque values, because that is the thing
   * the claim is about — and because a dropped layer reads as an ordinary
   * inequality between two random numbers if you only compare what was drawn.
   *
   * Both halves matter. `@ghostry/fabricator` before `0.0.6` overlaid the
   * instance it was handed rather than the frame in effect, so the reversed
   * order lost `"@ghostry/extern"` entirely — the enclosing layer replaced
   * rather than extended, while still governing every draw.
   */
  it("keeps every salt layer in either order, differing only in their order", async () => {
    const saltIn = async (order: "extern-last" | "extern-first") => {
      const { instance, fabricated, inTest } = await arrange(order);

      return inTest("alpha", () => {
        fabricated();
        return instance.context.salt;
      });
    };

    expect(await saltIn("extern-last")).toEqual([
      "three-way",
      "test",
      "alpha",
      "@ghostry/extern",
    ]);

    expect(await saltIn("extern-first")).toEqual([
      "three-way",
      "@ghostry/extern",
      "test",
      "alpha",
    ]);
  });

  /**
   * The cost of flipping the order, and why it is a decision to make once: the
   * layers compose either way, but not to the same salt, so every fabricated
   * value in the suite moves.
   */
  it("fabricates different values under the two orders", async () => {
    const valueIn = async (order: "extern-last" | "extern-first") => {
      const { fabricated, inTest } = await arrange(order);
      return inTest("alpha", () => fabricated());
    };

    expect(await valueIn("extern-last")).not.toEqual(
      await valueIn("extern-first"),
    );
  });

  /**
   * Harness rejects a key collision across integrations from
   * `Object.keys(provides)`, so two libraries contributing to one context is
   * only safe if their keys are actually distinct. Both are reachable in one
   * body, and both are live.
   */
  it("contributes both context keys, each usable in one body", async () => {
    const { fabricated, inTest } = await arrange("extern-last");

    const seen = inTest("both", (context) => {
      const substituted: Id = { id: -1 };
      context.extern.mock(schema).with(substituted);

      return {
        mocked: fabricated(),
        viaProvided: new context.fabricator.Fabricator(schema).fabricate(),
      };
    });

    /** extern's mock wins over the extension's production. */
    expect(seen.mocked).toEqual({ id: -1 });

    /** And the harness's own scope is still drawing, independently. */
    expect(seen.viaProvided).toBeDefined();
  });
});

/**
 * Deriving fabricator data inside a test, identically under both orders.
 *
 * The per-test `wrap` governs the instance handed to `integration(...)` and its
 * ancestors, never a fork of it. So a bare `instance.fork()` taken inside the
 * body draws its own configuration — the same data in every test — while a
 * fork of `instance.context.scope()`, the scope in effect, carries every layer
 * and is per test. Blocks stay per test either way, which is what makes the
 * bare fork easy to miss.
 */
describe("a fork taken inside a test", () => {
  const CLOCK = new Date("2024-01-01T00:00:00.000Z");

  type Drawn = { readonly salt: ReadonlyArray<string>; readonly value: Id };

  const forksUnder = async (order: "extern-last" | "extern-first") => {
    const instance = initializeFabricator({ salt: "forking", clock: CLOCK });

    const composed = await initializeExtern({
      scope: "async",
      extensions: [fabricatorExtension({ instance })],
    });

    const harnessed = initializeHarness({
      framework,
      integrations:
        order === "extern-last" ?
          [integration(instance), externIntegration(composed)]
        : [externIntegration(composed), integration(instance)],
    });

    const draw = (from: typeof instance): Drawn => ({
      salt: from.context.salt,
      value: new from.Fabricator(schema).fabricate(),
    });

    const forksIn = (name: string) => {
      const before = registered.length;

      harnessed.it(name, () => ({
        bare: draw(instance.fork({ salt: layer("A") })),
        scoped: draw(instance.context.scope().fork({ salt: layer("A") })),
      }));

      const added = registered[before];
      if (added === undefined)
        throw new Error(`\`it(${name})\` registered nothing`);

      return added.fn() as { readonly bare: Drawn; readonly scoped: Drawn };
    };

    return { alpha: forksIn("alpha"), beta: forksIn("beta") };
  };

  it("draws the same data in every test from a bare fork, in either order", async () => {
    for (const order of ["extern-last", "extern-first"] as const) {
      const { alpha, beta } = await forksUnder(order);

      expect(alpha.bare.salt).toEqual(["forking", "A"]);
      expect(alpha.bare.value).toEqual(beta.bare.value);
    }
  });

  it("draws per-test data from a fork of the scope, keeping every layer", async () => {
    const externLast = await forksUnder("extern-last");

    expect(externLast.alpha.scoped.salt).toEqual([
      "forking",
      "test",
      "alpha",
      "@ghostry/extern",
      "A",
    ]);
    expect(externLast.alpha.scoped.value).not.toEqual(
      externLast.beta.scoped.value,
    );

    const externFirst = await forksUnder("extern-first");

    expect(externFirst.alpha.scoped.salt).toEqual([
      "forking",
      "@ghostry/extern",
      "test",
      "alpha",
      "A",
    ]);
    expect(externFirst.alpha.scoped.value).not.toEqual(
      externFirst.beta.scoped.value,
    );
  });
});
