import { initialize as initializeExtern } from "@ghostry/extern";
import { initialize as initializeFabricator } from "@ghostry/fabricator";
import { describe, expect, it } from "bun:test";
import { fabricatorExtension } from "../src";
import { fabricateElsewhere } from "./fixtures/elsewhere";

const fabricator = initializeFabricator({ salt: "determinism-suite" });
const { T } = fabricator;

type Id = { id: number };
const schema = T.object({ id: T.number });
const other = T.object({ n: T.number });

const extern = await initializeExtern({
  scope: "async",
  extensions: [fabricatorExtension({ instance: fabricator })],
});

const block = (): Id =>
  extern.typed.by(schema).will((): Id => {
    throw new Error("unreachable");
  });

const named = (name: string): Id =>
  extern.typed
    .by(schema)
    .named(name)
    .will((): Id => {
      throw new Error("unreachable");
    });

describe("within one testing block", () => {
  it("reads the same value twice", async () => {
    await extern.testing(() => {
      expect(block()).toEqual(block());
    });
  });

  /**
   * The cache is what makes this hold, and it is load-bearing rather than an
   * optimization: a fabrication's distinctness comes from the scope's
   * construction ordinal, so asking twice without it would draw twice.
   */
  it("reads the same value twice under an explicit `produce()`", async () => {
    await extern.testing((mock) => {
      mock(schema).produce();

      expect(block()).toEqual(block());
    });
  });
});

describe("across testing blocks", () => {
  it("fabricates the same value in independent `testing()` calls", async () => {
    let first: Id | undefined;
    let second: Id | undefined;

    await extern.testing(() => void (first = block()));
    await extern.testing(() => void (second = block()));

    expect(first).toEqual(second!);
  });

  /**
   * Every testing scope starts from a fresh counter, so work in one scope
   * cannot shift a later one.
   */
  it("is unperturbed by an unrelated block sandwiched between", async () => {
    let before: Id | undefined;
    let after: Id | undefined;

    await extern.testing(() => void (before = block()));

    await extern.testing(() => {
      extern.typed.by(other).will((): { n: number } => {
        throw new Error("unreachable");
      });
    });

    await extern.testing(() => void (after = block()));

    expect(before).toEqual(after!);
  });
});

describe("across module boundaries", () => {
  it("draws identically for the same schema from another file", async () => {
    let here: Id | undefined;

    await extern.testing(() => void (here = block()));

    const there = await fabricateElsewhere<Id>(extern, schema);

    expect(here).toBeDefined();
    expect(here).toEqual(there);
  });
});

describe("the production cache", () => {
  /**
   * Keyed on `(identity, named)`, so one schema reached through two different
   * helpers inside one block is a single production — the second read returns
   * the first's value rather than drawing again. Worth pinning down: the
   * intuitive guess is that two syntactically distinct call sites fabricate
   * separately, and they do not.
   */
  it("serves one value for one identity, however many call sites read it", async () => {
    await extern.testing(() => {
      const direct = block();

      const throughHelper = ((): Id =>
        extern.typed.by(schema).will((): Id => {
          throw new Error("unreachable");
        }))();

      expect(direct).toEqual(throughHelper);
    });
  });
});

describe("a named block", () => {
  /**
   * Keyed by its own identity and name, and by nothing else. A name is the
   * whole mechanism for lifting a block out of positional identity, so work
   * done ahead of it inside the same scope must not move it — a second fixture
   * added to a test, a helper that fabricates on the way past.
   *
   * This is the test that would have caught the ordinal leaking into a named
   * block's trace. Every other determinism case here reads its block first, or
   * reads it in a scope of its own, so all of them held while this did not.
   */
  it("is unperturbed by draws that precede it in the same block", async () => {
    let alone: Id | undefined;
    let preceded: Id | undefined;

    await extern.testing(() => void (alone = named("alice")));

    await extern.testing(() => {
      new fabricator.Fabricator(other).fabricate();
      new fabricator.Fabricator(other).fabricate();

      preceded = named("alice");
    });

    expect(alone).toBeDefined();
    expect(alone).toEqual(preceded!);
  });

  /**
   * The contrast, and the reason the pin is scoped to named blocks alone.
   * Construction order is all that distinguishes two unnamed blocks, so it has
   * to keep moving their values — this is the documented behavior the name is
   * an opt-out *from*, not an inconsistency with the case above.
   */
  it("leaves an unnamed block positional", async () => {
    let alone: Id | undefined;
    let preceded: Id | undefined;

    await extern.testing(() => void (alone = block()));

    await extern.testing(() => {
      new fabricator.Fabricator(other).fabricate();

      preceded = block();
    });

    expect(alone).toBeDefined();
    expect(alone).not.toEqual(preceded!);
  });
});

describe("concurrency", () => {
  /**
   * Two named blocks resolved under `Promise.all`, constructed in one order on
   * the first run and the opposite order on the second. Their values must
   * depend on their names, not on the order they settle in — otherwise a
   * suite's data would shift with scheduling.
   *
   * The reversal is the whole test. Running one schedule twice establishes
   * nothing: two runs of identical code settle identically, so an
   * order-dependent value agrees with itself and passes. `settled` is asserted
   * against both orders for that reason — if the two schedules ever converge
   * again the test fails on the premise, rather than quietly going back to
   * passing for free.
   */
  it("keeps named blocks stable regardless of settle order", async () => {
    const run = async (
      goesFirst: "alpha" | "beta",
    ): Promise<{
      readonly alpha: Id;
      readonly beta: Id;
      readonly settled: ReadonlyArray<string>;
    }> => {
      const settled: string[] = [];
      let alpha: Id | undefined;
      let beta: Id | undefined;

      /** Yields a microtask unless this is the one meant to construct first. */
      const draw = async (name: "alpha" | "beta"): Promise<void> => {
        if (name !== goesFirst) await Promise.resolve();

        settled.push(name);

        if (name === "alpha") alpha = named(name);
        else beta = named(name);
      };

      await extern.testing(async () => {
        await Promise.all([draw("alpha"), draw("beta")]);
      });

      return { alpha: alpha!, beta: beta!, settled };
    };

    const forwards = await run("alpha");
    const backwards = await run("beta");

    // The premise: these two runs really did construct in opposite orders.
    expect(forwards.settled).toEqual(["alpha", "beta"]);
    expect(backwards.settled).toEqual(["beta", "alpha"]);

    // The claim: neither value moved when the order reversed.
    expect(forwards.alpha).toEqual(backwards.alpha);
    expect(forwards.beta).toEqual(backwards.beta);
    expect(forwards.alpha).not.toEqual(forwards.beta);
  });
});

describe("a user's own ambient construction", () => {
  /**
   * Deliberately *not* equal to the block's own value. Both draw from the same
   * scope, so they take successive ordinals — an ambient `fabricate()` is a
   * fresh draw, not a second view of the block's. Recorded because the
   * opposite is the intuitive guess, and a reader who assumes it would write
   * a test that passes for the wrong reason.
   */
  it("draws distinctly from the block's own fabrication", async () => {
    await extern.testing(() => {
      const fromBlock = block();
      const ambient = new fabricator.Fabricator(schema).fabricate();

      expect(ambient).not.toEqual(fromBlock);
    });
  });

  it("is itself deterministic across the await boundary", async () => {
    let sync: unknown;
    let afterAwait: unknown;

    await extern.testing(() => {
      sync = new fabricator.Fabricator(schema).fabricate();
    });

    await extern.testing(async () => {
      await Promise.resolve();
      afterAwait = new fabricator.Fabricator(schema).fabricate();
    });

    expect(sync).toEqual(afterAwait);
  });
});
