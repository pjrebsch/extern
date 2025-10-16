import * as S from "sury";
import { describe, expect, expectTypeOf, it } from "vitest";
import { initialize } from "../src";

describe("`extern.typed`", async () => {
  const extern = await initialize();

  describe("`by()`", () => {
    const schema = S.number;
    const subject = extern.typed.by(schema);

    it("returns from `will()`", () => {
      const result = subject.will(() => 123);

      expect(result).toBe(123);
    });

    describe("an async `will()` function", () => {
      it("returns a promise", async () => {
        const result = subject.will(async () => 123);

        await expect(result).resolves.toBe(123);
      });

      describe("returning a nullable empty type", () => {
        it("returns the empty type", async () => {
          type NullableType = {} | null;
          const schema = S.schema({});
          const value = null as NullableType;

          const result = extern.typed.by(schema).will(async () => value);

          expectTypeOf<typeof result>().toEqualTypeOf<{}>();
        });
      });

      describe("returning a nullable non-empty type", () => {
        it("returns the empty type", async () => {
          type NullableType = { abc: string } | null;
          const schema = S.schema({});
          const value = null as NullableType;

          const result = extern.typed.by(schema).will(async () => value);

          expectTypeOf<typeof result>().toEqualTypeOf<{}>();
        });
      });
    });

    describe("returning incorrect type", () => {
      it("returns the incorrectly typed data", () => {
        const result = subject.will(
          () =>
            /* @ts-expect-error */
            "abc",
        );

        expect(result).toBe("abc");
      });
    });

    describe("returning an object type with extra properties", () => {
      it("returns the schema type", () => {
        const schema = S.schema({});

        const result = extern.typed.by(schema).will(() => ({ abc: "xyz" }));

        expectTypeOf<S.Input<typeof schema>>().toEqualTypeOf<typeof result>();
      });
    });

    describe("`named()`", () => {
      const subject = extern.typed.by(schema).named("abc");

      it("returns from `will()`", () => {
        const result = subject.will(() => 123);

        expect(result).toBe(123);
      });

      describe("an async `will()` function", () => {
        it("returns a promise", async () => {
          const result = subject.will(async () => 123);

          await expect(result).resolves.toBe(123);
        });
      });

      describe("returning incorrect type", () => {
        it("returns the incorrectly typed data", () => {
          const result = subject.will(
            () =>
              /* @ts-expect-error */
              "abc",
          );

          expect(result).toBe("abc");
        });
      });

      describe("returning an object type with extra properties", () => {
        it("returns the schema type", () => {
          const schema = S.schema({});

          const result = extern.typed
            .by(schema)
            .named("abc")
            .will(() => ({ abc: "xyz" }));

          expectTypeOf<S.Input<typeof schema>>().toEqualTypeOf<typeof result>();
        });
      });

      describe("`given()`", () => {
        const subject = extern.typed.by(schema).named("abc").given(987);

        it("returns from `will()`", () => {
          const result = subject.will((given) => 123 + given);

          expect(result).toBe(1110);
        });

        describe("an async `will()` function", () => {
          it("returns a promise", async () => {
            const result = subject.will(async (given) => 123 + given);

            await expect(result).resolves.toBe(1110);
          });
        });

        describe("returning incorrect type", () => {
          it("returns the incorrectly typed data", () => {
            const result = subject.will(
              () =>
                /* @ts-expect-error */
                "abc",
            );

            expect(result).toBe("abc");
          });
        });

        describe("returning an object type with extra properties", () => {
          it("returns the schema type", () => {
            const schema = S.schema({});

            const result = extern.typed
              .by(schema)
              .named("abc")
              .given("...")
              .will(() => ({ abc: "xyz" }));

            expectTypeOf<S.Input<typeof schema>>().toEqualTypeOf<
              typeof result
            >();
          });
        });
      });
    });

    describe("`given()`", () => {
      const subject = extern.typed.by(S.number).given(987);

      it("returns from `will()`", () => {
        const result = subject.will((given) => 123 + given);

        expect(result).toBe(1110);
      });

      describe("an async `will()` function", () => {
        it("returns a promise", async () => {
          const result = subject.will(async (given) => 123 + given);

          await expect(result).resolves.toBe(1110);
        });

        describe("returning an object type with extra properties", () => {
          it("returns the schema type in a Promise", () => {
            const schema = S.schema({});

            const result = extern.typed
              .by(schema)
              .given("...")
              .will(async () => ({ abc: "xyz" }));

            expectTypeOf<typeof result>().toEqualTypeOf<Promise<{}>>();
          });
        });
      });

      describe("returning an object type with extra properties", () => {
        it("returns the schema type", () => {
          const schema = S.schema({});

          const result = extern.typed
            .by(schema)
            .given("...")
            .will(() => ({ abc: "xyz" }));

          expectTypeOf<S.Input<typeof schema>>().toEqualTypeOf<typeof result>();
        });
      });
    });
  });
});
