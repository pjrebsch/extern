import * as S from "sury";
import { describe, expect, it } from "vitest";
import { initialize, type Extern } from "../../src";
import {
  IllegalConcurrencyTestingError,
  NotMockedError,
  UnusedMocksError,
} from "../../src/Error";

describe("`extern.testing`", async () => {
  const extern = await initialize();

  const schema = S.number;

  describe("for `extern.validated`", async () => {
    const example = (extern: Extern) => {
      return extern.validated.by(schema).will(() => 123);
    };

    it("will substitute in the mock data", async () => {
      await extern.testing(async (mock) => {
        mock(schema).with(987);

        expect(await example(extern)).toBe(987);
      });
    });

    it("requires `extern` during execution to be mocked", async () => {
      await extern.testing(async () => {
        await expect(() => example(extern)).rejects.toThrowError(
          NotMockedError,
        );
      });
    });

    it("requires all mocks to be used by the end of the block", async () => {
      await expect(async () => {
        await extern.testing((mock) => {
          mock(schema).with(987);
        });
      }).rejects.toThrowError(UnusedMocksError);
    });

    describe("after the `testing()` block", () => {
      it("does not affect the original code path", async () => {
        await extern.testing(async (mock) => {
          mock(schema).with(987);
          await example(extern);
        });

        expect(await example(extern)).toBe(123);
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
              expect(await example(extern)).toBe(999);
            }),

            extern.testing(async (mock) => {
              mock(schema).with(777);
              unblock();
              expect(await example(extern)).toBe(777);
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
                expect(await example(extern)).toBe(999);
              }),

              extern.testing(async (mock) => {
                mock(schema).with(777);
                unblock();
                expect(await example(extern)).toBe(777);
              }),
            ]),
          ).rejects.toThrowError(IllegalConcurrencyTestingError);
        });
      });
    });

    describe("`extern.named()`", () => {
      const example = (extern: Extern) => {
        return extern.validated
          .by(schema)
          .named("abc")
          .will(() => 123);
      };

      describe("an exact mock", () => {
        it("will substitute in the mock data", async () => {
          await extern.testing(async (mock) => {
            mock(schema).named("abc").with(876);
            expect(await example(extern)).toBe(876);
          });
        });
      });

      describe("an inexact mock", () => {
        it("will substitute in the mock data", async () => {
          await extern.testing(async (mock) => {
            mock(schema).with(876);
            expect(await example(extern)).toBe(876);
          });
        });
      });

      describe("multiple mocks for the same schema", () => {
        const example = async (extern: Extern) => {
          const x = await extern.validated.by(schema).will(() => 10);
          const y = await extern.validated
            .by(schema)
            .named("abc")
            .will(() => 2);

          return x / y;
        };

        it("uses the mocks correctly", async () => {
          await extern.testing(async (mock) => {
            mock(schema).named("abc").with(9);
            mock(schema).with(27);

            expect(await example(extern)).toBe(3);
          });
        });
      });
    });

    describe("a spy", () => {
      const example = async (extern: Extern) => {
        const x = await extern.validated
          .by(schema)
          .given(10)
          .will((v) => v);

        const y = await extern.validated
          .by(schema)
          .named("abc")
          .will(() => 2);

        return x / y;
      };

      it("holds info of the mock", async () => {
        await extern.testing(async (mock) => {
          const spy = mock(schema).with(123);

          expect(spy.schema).toBe(schema);
          expect(spy.value).toBe(123);
          expect(spy.specificity).toBe(0);

          await example(extern);
        });
      });

      it("tracks executions", async () => {
        await extern.testing(async (mock) => {
          const spy = mock(schema).with(123);

          await example(extern);

          expect(spy.executions).toMatchObject([
            { mode: "validated", given: 10 },
            { mode: "validated", named: "abc" },
          ]);
        });
      });

      describe("with disambiguated mocks", () => {
        it("holds info of each mock", async () => {
          await extern.testing(async (mock) => {
            const spy1 = mock(schema).named("abc").with(9);
            const spy2 = mock(schema).with(27);

            expect(spy1.schema).toBe(schema);
            expect(spy1.value).toBe(9);
            expect(spy1.specificity).toBe(1);
            expect(spy1.named).toEqual("abc");

            expect(spy2.schema).toBe(schema);
            expect(spy2.value).toBe(27);
            expect(spy2.specificity).toBe(0);

            await example(extern);
          });
        });

        it("tracks executions by specificity", async () => {
          await extern.testing(async (mock) => {
            const spy1 = mock(schema).named("abc").with(9);
            const spy2 = mock(schema).with(27);

            await example(extern);

            expect(spy1.executions).toMatchObject([
              { mode: "validated", named: "abc" },
            ]);
            expect(spy2.executions).toMatchObject([
              { mode: "validated", given: 10 },
            ]);
          });
        });
      });
    });
  });
});
