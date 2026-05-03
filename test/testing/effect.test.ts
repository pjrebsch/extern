import { describe, expect, expectTypeOf, it } from "bun:test";
import { initialize, type Initialized } from "../../src";
import { DuplicateMockError, UnusedMocksError } from "../../src/Error";

describe("`extern.testing`", async () => {
  const extern = await initialize();

  describe("for `extern.effect`", () => {
    const buildExample = (extern: Initialized) => {
      const tracking = { runs: 0 };

      const example = () => {
        return extern.effect.named("abc").will(() => {
          tracking.runs++;
        });
      };

      return { example, tracking };
    };

    it("does not require the effect to be mocked", async () => {
      const { example } = buildExample(extern);

      await extern.testing(async () => {
        await expect(example()).resolves.toBeUndefined();
      });
    });

    it("suppresses execution of the original function", async () => {
      const { example, tracking } = buildExample(extern);

      await extern.testing(async () => {
        await example();
      });

      expect(tracking.runs).toBe(0);
    });

    it("requires all spies to be used by the end of the block", async () => {
      await expect(
        extern.testing((mock) => {
          mock.effect.named("abc").observe();
        }),
      ).rejects.toThrowError(UnusedMocksError);
    });

    describe("`passthrough()`", () => {
      it("allows the original function to run", async () => {
        const { example, tracking } = buildExample(extern);

        await extern.testing(async (mock) => {
          mock.effect.named("abc").passthrough();

          await example();
        });

        expect(tracking.runs).toBe(1);
      });
    });

    describe("outside of a testing block", () => {
      it("runs the original function", async () => {
        const { example, tracking } = buildExample(extern);

        example();

        expect(tracking.runs).toBe(1);
      });
    });

    describe("after the `testing()` block", () => {
      it("does not affect the original code path", async () => {
        const { example, tracking } = buildExample(extern);

        await extern.testing(async () => {
          await example();
        });

        await example();

        expect(tracking.runs).toBe(1);
      });
    });

    describe("a spy", () => {
      it("holds info of the effect", async () => {
        await extern.testing(async (mock) => {
          const { example } = buildExample(extern);

          const spy = mock.effect.named("abc").observe();

          expectTypeOf(spy.strategy).toEqualTypeOf<{
            readonly kind: "observe";
          }>();

          expect(spy.kind).toBe("effect");
          expect(spy.strategy).toEqual({ kind: "observe" });
          expect(spy.named).toBe("abc");
          expect(spy.specificity).toBe(1);

          await example();
        });
      });

      it("tracks executions", async () => {
        await extern.testing(async (mock) => {
          const { example } = buildExample(extern);

          const spy = mock.effect.named("abc").observe();

          await example();
          await example();

          expect(spy.executions).toMatchObject([
            { mode: "effect", named: "abc" },
            { mode: "effect", named: "abc" },
          ]);
        });
      });

      it("does not track executions of an effect of a different name", async () => {
        await extern.testing(async (mock) => {
          const example = (extern: Initialized) => {
            extern.effect.named("abc").will(() => {});
            extern.effect.named("xyz").will(() => {});
          };

          const spy = mock.effect.named("abc").observe();

          await example(extern);

          expect(spy.executions.length).toBe(1);
          expect(spy.executions).toMatchObject([
            { mode: "effect", named: "abc" },
          ]);
        });
      });

      describe("when accessed more than once for the same name", () => {
        it("throws an error", async () => {
          await expect(
            extern.testing((mock) => {
              const a = mock.effect.named("abc");
              const b = mock.effect.named("abc");
              a.observe();
              b.observe();
            }),
          ).rejects.toThrowError(DuplicateMockError);
        });
      });

      describe("of a passthrough mock", () => {
        it("has a passthrough strategy", async () => {
          await extern.testing(async (mock) => {
            const { example } = buildExample(extern);

            const spy = mock.effect.named("abc").passthrough();

            expectTypeOf(spy.strategy).toEqualTypeOf<{
              readonly kind: "passthrough";
            }>();

            expect(spy.strategy).toEqual({ kind: "passthrough" });

            await example();
          });
        });

        it("tracks executions", async () => {
          await extern.testing(async (mock) => {
            const { example } = buildExample(extern);

            const spy = mock.effect.named("abc").passthrough();

            await example();
            await example();

            expect(spy.executions).toMatchObject([
              { mode: "effect", named: "abc" },
              { mode: "effect", named: "abc" },
            ]);
          });
        });
      });
    });
  });
});
