import { describe, expect, expectTypeOf, it } from "bun:test";
import * as S from "sury";
import { initialize, type Initialized } from "../../src";
import {
  IllegalConcurrencyTestingError,
  NotMockedError,
  UnusedMocksError,
} from "../../src/Error";

describe("`extern.testing`", async () => {
  const extern = await initialize();

  describe("for `extern.typed`", async () => {
    describe.each([
      { describe: "with a schema", schema: S.number },
      { describe: "with an `extern.T`", schema: extern.T<number>() },
    ])("$describe", ({ schema }) => {
      const example = (extern: Initialized) => {
        return extern.typed.by(schema).will(() => 123);
      };

      it("will substitute in the mock data", async () => {
        await extern.testing((mock) => {
          mock(schema).with(987);

          expect(example(extern)).toBe(987);
        });
      });

      it("requires `extern` during execution to be mocked", async () => {
        await extern.testing(() => {
          expect(() => example(extern)).toThrowError(NotMockedError);
        });
      });

      it("requires all mocks to be used by the end of the block", async () => {
        await expect(
          extern.testing((mock) => {
            mock(schema).with(987);
          }),
        ).rejects.toThrowError(UnusedMocksError);
      });

      describe("`skip()`", () => {
        it("allows the original function to run", async () => {
          await extern.testing((mock) => {
            mock(schema).skip();

            expect(example(extern)).toBe(123);
          });
        });
      });

      describe("after the `testing()` block", () => {
        it("does not affect the original code path", async () => {
          await extern.testing((mock) => {
            mock(schema).with(987);
            example(extern);
          });

          expect(example(extern)).toBe(123);
        });
      });

      describe("race condition", () => {
        describe("using `async` scope", async () => {
          const extern = await initialize({ scope: "async" });

          it("provides the correct mocking data in each block", async () => {
            let unblock = () => {};
            const blocker = new Promise<void>((r) => (unblock = r));

            await Promise.all([
              extern.testing(async (mock) => {
                mock(schema).with(999);
                await blocker;
                expect(example(extern)).toBe(999);
              }),

              extern.testing(async (mock) => {
                mock(schema).with(777);
                unblock();
                expect(example(extern)).toBe(777);
              }),
            ]);
          });
        });

        describe("using `sync` scope", async () => {
          const extern = await initialize({ scope: "sync" });

          it("throws a concurrency error", async () => {
            let unblock = () => {};
            const blocker = new Promise<void>((r) => (unblock = r));

            await expect(
              Promise.all([
                extern.testing(async (mock) => {
                  mock(schema).with(999);
                  await blocker;
                  expect(example(extern)).toBe(999);
                }),

                extern.testing(async (mock) => {
                  mock(schema).with(777);
                  unblock();
                  expect(example(extern)).toBe(777);
                }),
              ]),
            ).rejects.toThrowError(IllegalConcurrencyTestingError);
          });
        });
      });

      describe("`extern.named()`", () => {
        const example = (extern: Initialized) => {
          return extern.typed
            .by(schema)
            .named("abc")
            .will(() => 123);
        };

        describe("an exact mock", () => {
          it("will substitute in the mock data", async () => {
            await extern.testing((mock) => {
              mock(schema).named("abc").with(876);
              expect(example(extern)).toBe(876);
            });
          });
        });

        describe("an inexact mock", () => {
          it("will substitute in the mock data", async () => {
            await extern.testing((mock) => {
              mock(schema).with(876);
              expect(example(extern)).toBe(876);
            });
          });
        });

        describe("multiple mocks for the same schema", () => {
          const example = (extern: Initialized) => {
            const x = extern.typed.by(schema).will(() => 10);

            const y = extern.typed
              .by(schema)
              .named("abc")
              .will(() => 2);

            return x / y;
          };

          it("uses the mocks correctly", async () => {
            await extern.testing((mock) => {
              mock(schema).named("abc").with(9);
              mock(schema).with(27);

              expect(example(extern)).toBe(3);
            });
          });

          describe("skipping an exact mock", () => {
            it("does not skip inexact mocks", async () => {
              await extern.testing((mock) => {
                mock(schema).named("abc").skip();
                mock(schema).with(30);

                expect(example(extern)).toBe(15);
              });
            });
          });

          describe("skipping an inexact mock", () => {
            it("skips all mocks", async () => {
              await extern.testing((mock) => {
                mock(schema).skip();

                expect(example(extern)).toBe(5);
              });
            });
          });
        });
      });

      describe("a spy", () => {
        const example = (extern: Initialized) => {
          const x = extern.typed
            .by(schema)
            .given(10)
            .will((v) => v);

          const y = extern.typed
            .by(schema)
            .named("abc")
            .will(() => 2);

          return x / y;
        };

        it("holds info of the mock", async () => {
          await extern.testing((mock) => {
            const spy = mock(schema).with(123);

            expectTypeOf(spy.strategy).toEqualTypeOf<{
              readonly kind: "substitute";
              readonly value: number;
            }>();

            expect(spy.kind).toBe("value");
            expect(spy.strategy).toEqual({ kind: "substitute", value: 123 });
            expect(spy.schema).toBe(schema);
            expect(spy.specificity).toBe(0);

            example(extern);
          });
        });

        it("tracks executions", async () => {
          await extern.testing((mock) => {
            const spy = mock(schema).with(123);

            example(extern);

            expect(spy.executions).toMatchObject([
              { mode: "typed", given: 10 },
              { mode: "typed", named: "abc" },
            ]);
          });
        });

        describe("with disambiguated mocks", () => {
          it("holds info of each mock", async () => {
            await extern.testing((mock) => {
              const spy1 = mock(schema).named("abc").with(9);
              const spy2 = mock(schema).with(27);

              expect(spy1.strategy).toEqual({ kind: "substitute", value: 9 });
              expect(spy1.schema).toBe(schema);
              expect(spy1.specificity).toBe(1);
              expect(spy1.named).toEqual("abc");

              expect(spy2.strategy).toEqual({ kind: "substitute", value: 27 });
              expect(spy2.schema).toBe(schema);
              expect(spy2.specificity).toBe(0);

              example(extern);
            });
          });

          it("tracks executions by specificity", async () => {
            await extern.testing((mock) => {
              const spy1 = mock(schema).named("abc").with(9);
              const spy2 = mock(schema).with(27);

              example(extern);

              expect(spy1.executions).toMatchObject([
                { mode: "typed", named: "abc" },
              ]);
              expect(spy2.executions).toMatchObject([
                { mode: "typed", given: 10 },
              ]);
            });
          });
        });

        describe("of a skipped mock", () => {
          it("has a passthrough strategy", async () => {
            await extern.testing((mock) => {
              const spy = mock(schema).skip();

              expectTypeOf(spy.strategy).toEqualTypeOf<{
                readonly kind: "passthrough";
              }>();

              expect(spy.strategy).toEqual({ kind: "passthrough" });

              example(extern);
            });
          });

          it("tracks executions", async () => {
            await extern.testing((mock) => {
              const spy = mock(schema).skip();

              example(extern);

              expect(spy.executions).toMatchObject([
                { mode: "typed", given: 10 },
                { mode: "typed", named: "abc" },
              ]);
            });
          });
        });
      });
    });
  });
});
