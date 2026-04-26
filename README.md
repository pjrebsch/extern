# extern

[![npm page](<https://img.shields.io/badge/%40ghostry%2Fextern-rgba(0,0,0,0).svg?style=for-the-badge&logo=npm&logoColor=CB3837>)](https://www.npmjs.com/package/@ghostry/extern)

Provides the most seamless possible approach to typed dependency injection for test suites, with optional runtime validation of externally-sourced data.

## Example

### Initialization

```ts
import { initialize } from "@ghostry/extern";

/**
 * Initialize an instance of the library with optional
 * configuration.
 */
export const extern = await initialize({});
```

### Source

```ts
/**
 * Import the library from the initialization module.
 */
import { extern } from "./extern.ts";

/**
 * Bring one or more of your choice of validation library
 * that conforms to Standard Schema.
 */
import * as S from "sury";

/**
 * The function to be mocked.
 *
 * For demonstration, it performs some simple math, but it
 * represents an interaction with an external system which
 * would not be within the intended scope of a unit test.
 */
function fetchSomething(x: number) {
  return x + 1;
}

/**
 * A function that represents interaction with an external
 * system, but unlike the other example function above, this
 * does not return anything useful to the calling code.
 */
function doSomething() {
  console.log("something was done");
}

/**
 * A schema definition (from a schema library of choice that
 * conforms to Standard Schema) which is used in multiple ways:
 *
 * 1. It defines the expected output type of the external
 *    interaction using schema type inference.
 *
 * 2. It is optionally used to validate the data type at runtime
 *    to eliminate bugs due to unexpected return data.
 *
 * 3. It is used to associate mocks in a test suite.
 */
export const schema = S.number;

/**
 * The function that will be tested.
 */
export function example() {
  const initial = 1;

  /**
   * Use the library to wrap external interactions that produce a value.
   */
  const result = extern.validated.by(schema).will(() => fetchSomething(1));

  /**
   * Use the library to wrap external interactions that perform an effect.
   */
  extern.effect.will(doSomething);

  return initial + result;
}
```

### Test

```ts
import { extern } from "./extern.ts";
import { example, schema } from "./source.ts";
import { test, expect } from "bun:test";

test("example test", async () => {
  /**
   * By default, the function to test will still execute its
   * external interaction even though it was wrapped at its
   * source.  This prevents immediately breaking any existing
   * tests written for the function.
   */
  expect(example()).toEqual(3);

  /**
   * Enable dependency-injection style mocking.
   *
   * This begins tracking uses of `extern` at runtime with
   * their associated schema definition.
   *
   * The `testing` function receives a function to mock uses
   * of `extern` with static test data.
   *
   * It identifies which external interaction to mock by the
   * schema definition used.  (In many cases, this will be
   * sufficient, but disambiguation is possible as necessary.)
   *
   * Effect blocks (unlike value blocks) do not need to be
   * mocked as they will always be skipped.  (Spying on
   * them is still possible though.)
   */
  await extern.testing((mock) => {
    /**
     * The mocking data must conform to the schema type.  This
     * is enforced by TypeScript.
     *
     * Each mock returns a dedicated spy which can be used
     * later to inspect executions that used the mock.
     */
    const spy = mock(schema).with(999);

    /**
     * The function will not execute the external interactions.
     * Instead, the mocked data will be returned in its place.
     * Thus, the result is different, as expected.
     */
    expect(example()).toEqual(1000);

    /**
     * Assertions can be made about the mocked executions
     * that have occurred.
     */
    expect(spy.executions).toHaveLength(1);
  });

  /**
   * Outside of the testing block, all wrapped interactions
   * will run normally, including effects.
   */
  expect(example()).toEqual(3);
});
```

## Philosophy

This library was born from a philosophy of testing an application system in isolation, in contrast to testing it in the live context of other systems. In other words: "unit testing" individual systems of an application as opposed to "integration testing" the collection of them.

The conventional approach to automated testing of an application is to construct a testing environment where all of the relevant interdependent systems are brought online and configured to use each other.

As a result, test suites can often suffer in performance because that approach does not scale well as the test suite expands. With decent test coverage of a moderately complex application, there will be a lot of cross-system communication and a lot of repeated testing of the same code paths. Both of these can significantly slow the suite as a whole.

Of course, holistic, integrated, end-to-end testing does have its place, but most tests do not need to actually excercise common code paths and cross-system communication repeatedly for the test to be useful and effective. It can often be perfectly sufficient to know that cross-system communication is _attempted_ rather than truly _performed_.

One approach to achieve this would be traditional dependency injection. However, that often pollutes the interface of source code by altering function signatures or requiring unnatural abstractions to get an injection to where it needs to be. This library aims to provide dependency injection transparently with the minimal amount of "source code pollution" necessary.

## Guidance

Since anything wrapped by `extern` will not be excercised when mocked, wrap code at the lowest possible abstraction level necessary to facilitate the external interaction, and avoid wrapping any code containing business logic.

## API

There are 2 primary APIs for wrapping code that works with external systems. Which one to use depends on whether the wrapped code will produce a value or not.

### For code that produces a value

If the source code block produces a value that must be substituted during tests, use `extern.validated` or `extern.typed`.

#### `validated` vs `typed`

When wrapping a source code block, there are two modes available to determine how the provided schema is used: `validated` and `typed`.

Using `validated` causes the return data of the extern block to be validated by the associated schema. This ensures that the resulting data is of the type defined by the schema. If validation fails, an `InvalidDataTypeError` will be thrown.

Using `typed` will not invoke any runtime validation of the data returned by the extern block. The associated schema will only be used to declare the type in TypeScript, but the actual data returned by the block may not be of that type at all. This can be preferred if the data type is already being validated within the block, as there is no need to incur additional runtime overhead of revalidating it. This may also be ideal if you wish to perform validation manually.

Due to the Standard Schema specification, schema validation may or may not return a Promise. To account for this, an `extern.validated` block will always return the result wrapped in a Promise, whereas `extern.typed` will return the result of the block synchronously.

#### `by`

Determines the schema used for the extern block.

The schema must support [Standard Schema v1](https://standardschema.dev/), but there are no other requirements. You can use multiple different schema libraries if you wish.

The exact same schema object should be available to both source code and tests since there is no standardized way of determining equality between different schema objects that represent the same schema structure.

> [!CAUTION]
>
> Be careful with an empty object schema, especially with an async block function!
>
> A Promise itself satisfies the empty interface regardless of what it may wrap which can cause type confusion with the resulting value.
>
> See https://typescript-eslint.io/rules/no-empty-object-type

#### `named`

Names the extern block for the sole purpose of disambiguating its mock in a test suite.

#### `given`

An extern block will usually need to reference parameters outside of itself to perform the desired external interaction. One way of making these references is to make a closure over outside variables:

```ts
function comments(postId: number) {
  return extern.typed.by(schema).will(
    /**
     * Makes a closure over the `postId` variable.
     */
    () => fetchComments(postId),
  );
}
```

But you may wish to make assertions in your tests about the data that was provided to an extern block. So instead, you can pass data into the extern block function from the extern chain with `given`:

```ts
function comments(postId: number) {
  /**
   * Parameter for extern block function is provided without
   * the need for a closure.
   */
  return extern.typed.by(schema).given(postId).will(fetchComments);
}
```

The given data is then available for assertions in your tests:

```ts
await extern.testing((mock) => {
  const spy = mock(schema).with([]);

  comments(123);

  expect(spy.executions[0]).toMatchObject({ given: 123 });
});
```

#### `will`

Defines the extern block function to be executed according to the extern chain preceding it.

It will receive the `given` data as its only parameter.

The return value is subject to the type defined by the associated schema and the mode defined in its extern chain.

#### Mocking requirements

Within `extern.testing()`, all value-producing `extern` blocks **must** be mocked. If such a block is used without a registered mock, an error will be thrown, even if the test would not otherwise fail. The expectation of this library is that no external interactions will actually occur during tests since testing scopes should be isolated for the sake of performance and reliability. If external interactions do need to occur during a test, the requirement can be disabled as necessary (as a later section covers).

Also, any defined `mock` must end up being used by the end of the `extern.testing()` block, otherwise an `UnusedMocksError` will be thrown, even if the test would not otherwise fail. This prevents superfluous mocking that results in confusion about what setup is actually needed to run a test.

#### Schema requirements

The schema used between an `extern` block and its corresponding `mock` must be the same JavaScript object (satisfying [`SameValueZero`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Equality_comparisons_and_sameness#same-value-zero_equality) comparison). Therefore, the schema should be defined separately and exported in a way to be accessible to both the source code and tests.

#### Disambiguating mocks

If a test will be executing multiple external interactions that use the same schema definition within a single `extern.testing()` block, mock registration for that schema definition may need to be disambiguated. Without disambiguation, the same data will be used for all `extern` blocks using that schema.

Currently, only `named` is supported for disambiguation. To use this, define the name on the `extern` block and on the `mock`:

```ts
extern.typed
  .by(schema)
  .named("abc")
  .will(() => 123);
```

```ts
/**
 * This mock targets all extern blocks using the schema,
 * regardless of any disambiguations that may be assigned
 * to the extern block.
 */
mock(schema).with(321);

/**
 * This mock targets all extern blocks using the schema
 * that have been named "abc", taking priority over
 * less-specific mocks that would otherwise apply.
 */
mock(schema).named("abc").with(789);
```

Registering more than one mock with the same disambiguation for the same schema will immediately throw an error.

#### Skipping mocks

In some tests, you may wish to run the original code instead of mocking it, but not defining a mock will throw an `UnusedMocksError`.

You can achieve this by explicitly skipping that mock:

```ts
/** Disables the mocking requirement and runs the original code block. */
mock(schema).skip();

/** Disambiguation is also supported here. */
mock(schema).named("abc").skip();
```

### For code that only performs an effect

If the source code block does not produce a value, then wrapping it with `extern.effect` allows for a simpler integration.

```ts
extern.effect.will(() => sendMetric("login.success"));
```

Because there is no return data, no schema is involved and no `by` is needed. The wrapped function must return `void` or `Promise<void>`.

By default, source code wrapped with `extern.effect` will be skipped within `extern.testing()`. Unlike value-producing blocks, there is no requirement to register a mock for it; an unmocked effect simply does nothing.

Outside of `extern.testing()`, the wrapped function runs normally as if `extern` were not involved.

#### `named`

Names the effect block so that it can be spied on in tests:

```ts
extern.effect
  .named("send login metric")
  .will(() => sendMetric("login.success"));
```

Unnamed effect blocks cannot be observed in tests. They are always skipped within `extern.testing()` with no opportunity to inspect them.

#### `given`

As with value-producing blocks, `given` provides data to the block function from the extern chain instead of through a closure, which makes the data available for assertions in tests:

```ts
function trackView(postId: number) {
  return extern.effect.named("track view").given(postId).will(sendViewMetric);
}
```

```ts
await extern.testing((mock) => {
  const spy = mock.effect.named("track view").observe();

  trackView(123);

  expect(spy.executions[0]).toMatchObject({ given: 123 });
});
```

`given` is only available after `named`, since spying on the captured data requires that the block be identifiable.

#### `will`

Defines the effect block function to be executed according to the extern chain preceding it.

It will receive the `given` data as its only parameter.

The return type must be `void` or `Promise<void>`.

#### Spying on effects

Named effects can be observed during a test in one of two ways:

```ts
/**
 * Tracks executions and continues to suppress the original
 * function (the default behavior for effects in tests).
 */
const spy = mock.effect.named("track view").observe();

/**
 * Tracks executions and allows the original function to run.
 */
const spy = mock.effect.named("track view").passthrough();
```

Each returns a spy whose `executions` array records every call to the matching effect block, with any `given` data attached. As with value-producing mocks, a registered effect spy must be exercised at least once before the `extern.testing()` block ends, otherwise an `UnusedMocksError` will be thrown.
