import type { $$Spy } from "./Mocking";
import type { StandardSchemaV1 } from "./StandardSchema";

/**
 * Base error class from which more specific errors inherit.
 */
export abstract class ExternError extends Error {
  constructor() {
    super();
    this.name = "ExternError";
  }
}

/**
 * The error thrown during an `extern.validated` block if the block
 * function's return value does not conform to the specified schema.
 */
export class InvalidDataTypeError extends ExternError {
  constructor(
    /**
     * The schema the data was validated against.
     */
    public readonly schema: StandardSchemaV1,

    /**
     * The list of validation issues found.
     */
    public readonly issues: ReadonlyArray<StandardSchemaV1.Issue>,
  ) {
    super();
    this.name = "InvalidDataTypeError" as const;
    this.message = "Evaluated result did not match schema.";
  }
}

/**
 * The error thrown during concurrently executing `extern.testing` blocks
 * when the library has not been allowed execute them concurrently.
 */
export class IllegalConcurrencyTestingError extends ExternError {
  constructor() {
    super();
    this.name = "IllegalConcurrencyTesting" as const;
    this.message =
      "The current runtime does not support `node:async_hooks` (or the "
      + "library was specifically configured not to use it), so "
      + "concurrent testing is not allowed.  This error was thrown "
      + "because your test suite used `extern.testing()` concurrently "
      + "which cannot be deterministic in this situation.  To achieve "
      + "test concurrency with this runtime, spawn separate instances "
      + "to execute separate portions of the suite.";
  }
}

/**
 * The error thrown when a mock is defined with the same schema and
 * disambiguation as a previously defined mock.
 */
export class DuplicateMockError extends ExternError {
  constructor() {
    super();
    this.name = "DuplicateMockError";
    this.message = "Schema with this disambiguation has already been mocked.";
  }
}

/**
 * The error thrown during an `extern.testing` block when an extern block
 * has not been mocked.
 */
export class NotMockedError extends ExternError {
  constructor() {
    super();
    this.name = "NotMockedError";
    this.message =
      "A code path using `extern` was not mocked. During an `extern.testing` "
      + "block, all tested code paths using `extern` must be mocked.";
  }
}

/**
 * The error thrown at the end of an `extern.testing` block if there were
 * any mocks defined that were never used.
 */
export class UnusedMocksError extends ExternError {
  constructor(
    /**
     * The list of mocks that were found to not be used.
     */
    public readonly unused: ReadonlyArray<$$Spy>,
  ) {
    super();
    this.name = "UnusedMocksError";
    this.message = "The testing block defined mocks that did not get used.";
  }
}
