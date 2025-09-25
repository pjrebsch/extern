import * as S from "sury";
import { describe, expect, expectTypeOf, it } from "vitest";
import { initialize } from "../src";
import { InvalidDataTypeError } from "../src/Error";

describe("`extern.validated`", async () => {
  const extern = await initialize();

  describe("`by()`", () => {
    const schema = S.number;
    const subject = extern.validated.by(schema);

    it("returns from `will()`", async () => {
      const result = subject.will(() => 123);

      await expect(result).resolves.toBe(123);
    });

    describe("an async `will()` function", () => {
      it("flattens the promise", async () => {
        const result = subject.will(async () => 123);

        await expect(result).resolves.toBe(123);
      });
    });

    describe("returning incorrect type", () => {
      it("throws an error", async () => {
        const result = subject.will(
          () =>
            /* @ts-expect-error */
            "abc",
        );

        const { issues } = await schema["~standard"].validate("abc");
        const error = new InvalidDataTypeError(schema, issues ?? []);

        await expect(result).rejects.toThrowError(error);
      });
    });

    describe("returning an object type with extra properties", () => {
      it("returns the schema type in a Promise", () => {
        const schema = S.schema({});

        const result = extern.validated.by(schema).will(() => ({ abc: "xyz" }));

        expectTypeOf<Promise<S.Input<typeof schema>>>().toEqualTypeOf<
          typeof result
        >();
      });
    });

    describe("`named()`", () => {
      const subject = extern.validated.by(schema).named("abc");

      it("returns from `will()`", async () => {
        const result = subject.will(() => 123);

        await expect(result).resolves.toBe(123);
      });

      describe("an async `will()` function", () => {
        it("flattens the promise", async () => {
          const result = subject.will(async () => 123);

          await expect(result).resolves.toBe(123);
        });
      });

      describe("returning incorrect type", () => {
        it("throws an error", async () => {
          const result = subject.will(
            () =>
              /* @ts-expect-error */
              "abc",
          );

          const { issues } = await schema["~standard"].validate("abc");
          const error = new InvalidDataTypeError(schema, issues ?? []);

          await expect(result).rejects.toThrowError(error);
        });
      });

      describe("returning an object type with extra properties", () => {
        it("returns the schema type in a Promise", () => {
          const schema = S.schema({});

          const result = extern.validated
            .by(schema)
            .named("abc")
            .will(() => ({ abc: "xyz" }));

          expectTypeOf<Promise<S.Input<typeof schema>>>().toEqualTypeOf<
            typeof result
          >();
        });
      });

      describe("`given()`", () => {
        const subject = extern.validated.by(schema).named("abc").given(987);

        it("returns from `will()`", async () => {
          const result = subject.will((given) => 123 + given);

          await expect(result).resolves.toBe(1110);
        });

        describe("an async `will()` function", () => {
          it("flattens the promise", async () => {
            const result = subject.will(async (given) => 123 + given);

            await expect(result).resolves.toBe(1110);
          });
        });

        describe("returning incorrect type", () => {
          it("throws an error", async () => {
            const result = subject.will(
              () =>
                /* @ts-expect-error */
                "abc",
            );

            const { issues } = await schema["~standard"].validate("abc");
            const error = new InvalidDataTypeError(schema, issues ?? []);

            await expect(result).rejects.toThrowError(error);
          });
        });

        describe("returning an object type with extra properties", () => {
          it("returns the schema type in a Promise", () => {
            const schema = S.schema({});

            const result = extern.validated
              .by(schema)
              .named("abc")
              .given("...")
              .will(() => ({ abc: "xyz" }));

            expectTypeOf<Promise<S.Input<typeof schema>>>().toEqualTypeOf<
              typeof result
            >();
          });
        });
      });
    });

    describe("`given()`", () => {
      const subject = extern.validated.by(S.number).given(987);

      it("returns from `will()`", async () => {
        const result = subject.will((given) => 123 + given);

        await expect(result).resolves.toBe(1110);
      });

      describe("an async `will()` function", () => {
        it("flattens the promise", async () => {
          const result = subject.will(async (given) => 123 + given);

          await expect(result).resolves.toBe(1110);
        });

        describe("returning an object type with extra properties", () => {
          it("returns the schema type in a Promise", () => {
            const schema = S.schema({});

            const result = extern.validated
              .by(schema)
              .given("...")
              .will(async () => ({ abc: "xyz" }));

            expectTypeOf<Promise<S.Input<typeof schema>>>().toEqualTypeOf<
              typeof result
            >();
          });
        });
      });

      describe("returning an object type with extra properties", () => {
        it("returns the schema type in a Promise", () => {
          const schema = S.schema({});

          const result = extern.validated
            .by(schema)
            .given("...")
            .will(() => ({ abc: "xyz" }));

          expectTypeOf<Promise<S.Input<typeof schema>>>().toEqualTypeOf<
            typeof result
          >();
        });
      });
    });
  });
});
