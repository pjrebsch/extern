import { describe, expect, it } from "bun:test";
import * as S from "sury";
import { initialize } from "../src";
import {
  AmbiguousIdentityError,
  ExtensionUnavailableError,
  NotMockedError,
  UnusedMocksError,
} from "../src/Error";
import {
  boxed,
  boxedExtension,
  brokenExtension,
  greedyExtension,
  observerExtension,
  opened,
  tagged,
  taggedExtension,
} from "./fixtures/extension";

describe("an extension", () => {
  describe("an unmocked block whose identity it claims", () => {
    it("produces a value instead of throwing", async () => {
      const extern = await initialize({ extensions: [boxedExtension()] });
      const schema = boxed<string>("a");

      await extern.testing(() => {
        expect(extern.typed.by(schema).will(() => "original")).toBe("a::1");
      });
    });

    it('still throws when the extension opts out with `unmocked: "error"`', async () => {
      const extern = await initialize({
        extensions: [boxedExtension({ unmocked: "error" })],
      });
      const schema = boxed<string>("a");

      await extern.testing(() => {
        expect(() => extern.typed.by(schema).will(() => "x")).toThrowError(
          NotMockedError,
        );
      });
    });

    it("throws for an identity no extension claims", async () => {
      const extern = await initialize({ extensions: [boxedExtension()] });

      await extern.testing(() => {
        expect(() => extern.typed.by(S.string).will(() => "x")).toThrowError(
          NotMockedError,
        );
      });
    });

    it("is not consulted at all outside a testing block", async () => {
      const extern = await initialize({ extensions: [boxedExtension()] });
      const schema = boxed<string>("a");

      expect(extern.typed.by(schema).will(() => "original")).toBe("original");
    });
  });

  describe("the per-block production cache", () => {
    it("makes reading the same block twice in one test agree", async () => {
      const extern = await initialize({ extensions: [boxedExtension()] });
      const schema = boxed<string>("a");

      await extern.testing(() => {
        const first = extern.typed.by(schema).will(() => "x");
        const second = extern.typed.by(schema).will(() => "x");

        expect(first).toBe(second);
      });
    });

    /**
     * The cache is keyed by name within an identity, so two differently-named
     * blocks over one schema stay distinct — the remedy for two concurrent
     * code paths that must not share a value.
     */
    it("keeps differently-named blocks over one identity distinct", async () => {
      const extern = await initialize({ extensions: [boxedExtension()] });
      const schema = boxed<string>("a");

      await extern.testing(() => {
        const left = extern.typed
          .by(schema)
          .named("left")
          .will(() => "x");
        const right = extern.typed
          .by(schema)
          .named("right")
          .will(() => "x");

        expect(left).not.toBe(right);
        expect(left).toBe("a:left:1");
        expect(right).toBe("a:right:2");
      });
    });

    it("keeps separate identities distinct within one block", async () => {
      const extern = await initialize({ extensions: [boxedExtension()] });

      await extern.testing(() => {
        const a = extern.typed.by(boxed<string>("a")).will(() => "x");
        const b = extern.typed.by(boxed<string>("b")).will(() => "x");

        expect(a).not.toBe(b);
      });
    });

    it("does not leak across testing blocks", async () => {
      const extern = await initialize({ extensions: [boxedExtension()] });
      const schema = boxed<string>("a");
      const seen: string[] = [];

      await extern.testing(() => {
        seen.push(extern.typed.by(schema).will(() => "x"));
      });
      await extern.testing(() => {
        seen.push(extern.typed.by(schema).will(() => "x"));
      });

      expect(seen[0]).toBe(seen[1]);
      expect(seen[0]).toBe("a::1");
    });
  });

  describe("`produce()`", () => {
    it("produces the same value the unmocked path would", async () => {
      const extern = await initialize({ extensions: [boxedExtension()] });
      const schema = boxed<string>("a");

      let observed = "";
      let unmocked = "";

      await extern.testing((mock) => {
        mock(schema).produce();
        observed = extern.typed.by(schema).will(() => "x");
      });

      await extern.testing(() => {
        unmocked = extern.typed.by(schema).will(() => "x");
      });

      expect(observed).toBe(unmocked);
    });

    it("hands back a spy that records the produced value", async () => {
      const extern = await initialize({ extensions: [boxedExtension()] });
      const schema = boxed<string>("a");

      await extern.testing((mock) => {
        const spy = mock(schema).produce();

        const value = extern.typed.by(schema).will(() => "x");

        expect(spy.executions).toHaveLength(1);
        expect(spy.executions[0]?.outcome).toEqual({ kind: "returned", value });
      });
    });

    it("counts as unused when the block never runs", async () => {
      const extern = await initialize({ extensions: [boxedExtension()] });

      expect(
        extern.testing((mock) => {
          mock(boxed<string>("a")).produce();
        }),
      ).rejects.toThrowError(UnusedMocksError);
    });

    it("is overridden by an explicit `with()`", async () => {
      const extern = await initialize({ extensions: [boxedExtension()] });
      const schema = boxed<string>("a");

      await extern.testing((mock) => {
        mock(schema).with("explicit");

        expect(extern.typed.by(schema).will(() => "x")).toBe("explicit");
      });
    });

    it("throws `ExtensionUnavailableError` with no extension configured", async () => {
      const extern = await initialize();
      const schema = boxed<string>("a");

      await extern.testing((mock) => {
        /**
         * Unreachable through the public types — `produce()` is not on the
         * interface for an instance with no extensions — so the cast stands
         * in for a plain JavaScript caller, which has no such guard.
         */
        (mock(schema as never) as { produce: () => void }).produce();

        expect(() =>
          extern.typed.by(schema as never).will(() => "x"),
        ).toThrowError(ExtensionUnavailableError);
      });
    });
  });

  describe("`produce(fn)`", () => {
    it("hands the callback the extension's own handle", async () => {
      const extern = await initialize({ extensions: [boxedExtension()] });
      const schema = boxed<string>("a");

      await extern.testing((mock) => {
        mock(schema).produce(({ via }) => via.build({ suffix: "shaped" }));

        expect(extern.typed.by(schema).will(() => "x")).toBe("a::1+shaped");
      });
    });

    /**
     * The handle is built by the extension around the value it would have
     * produced anyway, so a callback that shapes nothing lands exactly where
     * the no-callback form does. That equivalence is what makes shaping a
     * *modification* of a production rather than a separate one.
     */
    it("agrees with `produce()` when the callback shapes nothing", async () => {
      const extern = await initialize({ extensions: [boxedExtension()] });
      const schema = boxed<string>("a");

      let shaped = "";
      let plain = "";

      await extern.testing((mock) => {
        mock(schema).produce(({ via }) => via.build());
        shaped = extern.typed.by(schema).will(() => "x");
      });

      await extern.testing((mock) => {
        mock(schema).produce();
        plain = extern.typed.by(schema).will(() => "x");
      });

      expect(shaped).toBe(plain);
    });

    it("records the shaped value as the execution's outcome", async () => {
      const extern = await initialize({ extensions: [boxedExtension()] });
      const schema = boxed<string>("a");

      await extern.testing((mock) => {
        const spy = mock(schema).produce(({ via }) =>
          via.build({ suffix: "s" }),
        );

        const value = extern.typed.by(schema).will(() => "x");

        expect(value).toBe("a::1+s");
        expect(spy.executions).toHaveLength(1);
        expect(spy.executions[0]?.outcome).toEqual({ kind: "returned", value });
      });
    });

    it("accepts options after the callback", async () => {
      const extern = await initialize({ extensions: [boxedExtension()] });

      /**
       * Resolves without the block ever running, which is the whole point:
       * the second argument really is reaching `Options`, not being swallowed
       * as part of the callback form.
       */
      await extern.testing((mock) => {
        mock(boxed<string>("a")).produce(({ via }) => via.build(), {
          unused: "allow",
        });
      });
    });

    it("is available under `named(...)`, and sees the name in the handle", async () => {
      const extern = await initialize({ extensions: [boxedExtension()] });
      const schema = boxed<string>("a");

      await extern.testing((mock) => {
        mock(schema)
          .named("n")
          .produce(({ via }) => via.build({ suffix: "s" }));

        expect(
          extern.typed
            .by(schema)
            .named("n")
            .will(() => "x"),
        ).toBe("a:n:1+s");
      });
    });

    it("is overridden by an explicit `with()`", async () => {
      const extern = await initialize({ extensions: [boxedExtension()] });
      const schema = boxed<string>("a");

      await extern.testing((mock) => {
        mock(schema).with("explicit");

        expect(extern.typed.by(schema).will(() => "x")).toBe("explicit");
      });
    });

    it("rethrows what the callback throws, and still counts as used", async () => {
      const extern = await initialize({ extensions: [boxedExtension()] });
      const schema = boxed<string>("a");
      const boom = new Error("boom");

      await extern.testing((mock) => {
        const spy = mock(schema).produce((): string => {
          throw boom;
        });

        expect(() => extern.typed.by(schema).will(() => "x")).toThrowError(
          boom,
        );

        expect(spy.executions).toHaveLength(1);
        expect(spy.executions[0]?.outcome).toEqual({
          kind: "threw",
          error: boom,
        });
      });
    });
  });

  /**
   * Caching is not an optimization here. The boxed fixture folds a per-scope
   * ordinal into every value it produces — standing in for the
   * per-construction state a real extension derives distinctness from — so an
   * uncached path would visibly hand back a different value on each read.
   */
  describe("the production cache", () => {
    it("makes two reads of a `produce()`d block agree", async () => {
      const extern = await initialize({ extensions: [boxedExtension()] });
      const schema = boxed<string>("a");

      await extern.testing((mock) => {
        mock(schema).produce();

        const first = extern.typed.by(schema).will(() => "x");
        const second = extern.typed.by(schema).will(() => "x");

        expect(first).toBe(second);
      });
    });

    it("makes two reads of a `produce(fn)`d block agree, running it once", async () => {
      const extern = await initialize({ extensions: [boxedExtension()] });
      const schema = boxed<string>("a");

      let calls = 0;

      await extern.testing((mock) => {
        mock(schema).produce(({ via }) => {
          calls += 1;
          return via.build({ suffix: "s" });
        });

        const first = extern.typed.by(schema).will(() => "x");
        const second = extern.typed.by(schema).will(() => "x");

        expect(first).toBe(second);
        expect(calls).toBe(1);
      });
    });

    /**
     * The cache keys on `(identity, named)`, so two differently-named blocks
     * over one identity are separate entries and each callback runs.
     */
    it("keys on the name, not on the identity alone", async () => {
      const extern = await initialize({ extensions: [boxedExtension()] });
      const schema = boxed<string>("a");

      let calls = 0;

      await extern.testing((mock) => {
        const shape = ({ via }: { via: { build: () => string } }) => {
          calls += 1;
          return via.build();
        };

        mock(schema).named("one").produce(shape);
        mock(schema).named("two").produce(shape);

        const one = extern.typed
          .by(schema)
          .named("one")
          .will(() => "x");
        const two = extern.typed
          .by(schema)
          .named("two")
          .will(() => "x");

        expect(one).not.toBe(two);
        expect(calls).toBe(2);
      });
    });
  });

  describe("`Execution.outcome`", () => {
    it("records what a substituted block returned", async () => {
      const extern = await initialize();
      const schema = S.string;

      await extern.testing((mock) => {
        const spy = mock(schema).with("v");

        extern.typed.by(schema).will(() => "x");

        expect(spy.executions[0]?.outcome).toEqual({
          kind: "returned",
          value: "v",
        });
      });
    });

    /**
     * Recorded on the throwing path too, and the error rethrown unchanged.
     * Without this the block would count as unused despite plainly running.
     */
    it("records a throw, rethrows it, and still counts the mock as used", async () => {
      const extern = await initialize();
      const schema = S.string;
      const boom = new Error("boom");

      await extern.testing((mock) => {
        const spy = mock(schema).skip();

        expect(() =>
          extern.typed.by(schema).will((): string => {
            throw boom;
          }),
        ).toThrowError(boom);

        expect(spy.executions).toHaveLength(1);
        expect(spy.executions[0]?.outcome).toEqual({
          kind: "threw",
          error: boom,
        });
      });
    });
  });

  describe("the ignored roots handed to an extension", () => {
    /**
     * Asserted directly rather than through downstream determinism. A root
     * scoped too narrowly — this file's own directory instead of the package
     * source root — leaves extern's core frames eligible for an extension's
     * stack walk, and the walk then attributes a production to extern
     * internals. That failure is masked on any code path where the call into
     * the extension sits in tail position, so it cannot be caught reliably by
     * observing produced values.
     */
    it("covers extern's own internals, not just one directory", async () => {
      const seen = opened();
      const extern = await initialize({
        extensions: [boxedExtension({ opened: seen })],
      });

      await extern.testing(() => {});

      expect(seen.ignore).toHaveLength(1);

      const root = seen.ignore[0]!;
      const core = new URL("../src/typed/Core.ts", import.meta.url).href;
      const validated = new URL("../src/validated/Core.ts", import.meta.url)
        .href;

      expect(core.startsWith(root)).toBe(true);
      expect(validated.startsWith(root)).toBe(true);
    });

    it("opens the extension scope exactly once per testing block", async () => {
      const seen = opened();
      const extern = await initialize({
        extensions: [boxedExtension({ opened: seen })],
      });

      await extern.testing(() => {});
      await extern.testing(() => {});

      expect(seen.entered).toBe(2);
    });

    it("opens no extension scope when none was configured", async () => {
      const seen = opened();
      const extern = await initialize();

      await extern.testing(() => {});

      expect(seen.entered).toBe(0);
    });
  });

  /**
   * Producing is one of the two variants an extension can be, not what an
   * extension *is*. A debugging or reporting helper wants a scope per testing
   * block and nothing else — so configuring one must not change how any block
   * behaves.
   */
  describe("an observer extension", () => {
    it("still has its scope opened once per testing block", async () => {
      const seen = opened();
      const extern = await initialize({
        extensions: [observerExtension({ opened: seen })],
      });

      await extern.testing(() => {});
      await extern.testing(() => {});

      expect(seen.entered).toBe(2);
    });

    it("receives extern's ignored roots like any other extension", async () => {
      const seen = opened();
      const extern = await initialize({
        extensions: [observerExtension({ opened: seen })],
      });

      await extern.testing(() => {});

      const core = new URL("../src/typed/Core.ts", import.meta.url).href;

      expect(core.startsWith(seen.ignore[0]!)).toBe(true);
    });

    it("claims no identities, so unmocked blocks still throw", async () => {
      const extern = await initialize({ extensions: [observerExtension()] });

      await extern.testing(() => {
        expect(() => extern.typed.by(S.string).will(() => "x")).toThrowError(
          NotMockedError,
        );
      });
    });

    it("leaves ordinary mocking untouched", async () => {
      const extern = await initialize({ extensions: [observerExtension()] });

      await extern.testing((mock) => {
        mock(S.string).with("v");

        expect(extern.typed.by(S.string).will(() => "x")).toBe("v");
      });
    });

    it("coexists with a producing extension", async () => {
      const seen = opened();
      const extern = await initialize({
        extensions: [
          observerExtension({ opened: seen }),
          boxedExtension({ opened: seen }),
        ],
      });

      await extern.testing(() => {
        expect(extern.typed.by(boxed<string>("a")).will(() => "x")).toBe(
          "a::1",
        );
      });

      expect(seen.order).toEqual(["observer", "boxed"]);
    });
  });

  describe("an extension that claims identities but serves none", () => {
    /**
     * `supports` and `Session.produce` travel together, and the type system
     * cannot enforce it — so the violation surfaces as a clear error rather
     * than as a call on `undefined`.
     */
    it("fails loudly rather than calling `undefined`", async () => {
      const extern = await initialize({ extensions: [brokenExtension()] });

      await extern.testing(() => {
        expect(() =>
          extern.typed.by(boxed<string>("a")).will(() => "x"),
        ).toThrowError(ExtensionUnavailableError);
      });
    });
  });

  describe("several extensions at once", () => {
    it("routes each identity to the extension that claims it", async () => {
      const extern = await initialize({
        extensions: [boxedExtension(), taggedExtension()],
      });

      await extern.testing(() => {
        expect(extern.typed.by(boxed<string>("a")).will(() => "x")).toBe(
          "a::1",
        );
        expect(extern.typed.by(tagged<string>("b")).will(() => "x")).toBe(
          "tagged(b)",
        );
      });
    });

    it("opens every scope, in the order they were configured", async () => {
      const seen = opened();
      const extern = await initialize({
        extensions: [
          boxedExtension({ opened: seen }),
          taggedExtension({ opened: seen }),
        ],
      });

      await extern.testing(() => {});

      expect(seen.order).toEqual(["boxed", "tagged"]);
    });

    /**
     * Refused rather than resolved by order: when two lambdas both match,
     * TypeScript picks the produced type by its own inference-candidate
     * selection, independent of the order the extensions were passed in, so
     * no runtime dispatch rule is guaranteed to agree with the type the
     * caller was handed.
     */
    it("refuses an identity two extensions both claim", async () => {
      const extern = await initialize({
        extensions: [boxedExtension(), greedyExtension()],
      });

      await extern.testing(() => {
        expect(() =>
          extern.typed.by(boxed<string>("a")).will(() => "x"),
        ).toThrowError(AmbiguousIdentityError);
      });
    });

    it("names both extensions in the ambiguity error", async () => {
      const extern = await initialize({
        extensions: [boxedExtension(), greedyExtension()],
      });

      await extern.testing(() => {
        try {
          extern.typed.by(boxed<string>("a")).will(() => "x");
          expect.unreachable();
        } catch (error) {
          expect((error as AmbiguousIdentityError).extensions).toEqual([
            "boxed",
            "greedy",
          ]);
        }
      });
    });
  });
});
