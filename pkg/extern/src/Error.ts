import type { Spy } from "./Spy";
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
 * The error thrown when an object is provided to `extern.validated`
 * that does not conform to the Standard Schema interface.
 */
export class InvalidSchemaError extends ExternError {
  constructor() {
    super();
    this.name = "InvalidSchemaError";
    this.message = "Expected an object that conforms to Standard Schema.";
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
 * The error thrown when a block whose identity an extension claims would need
 * to produce a value, but no extension able to produce it is available.
 *
 * Unreachable through the public types: `produce()` only appears on the
 * interface `mock()` returns for identities an extension's lambda accepts,
 * which requires that extension to have been passed to `initialize()` in the
 * first place. A plain JavaScript consumer has no such guard, so this stays a
 * real runtime error rather than an assertion.
 */
export class ExtensionUnavailableError extends ExternError {
  constructor() {
    super();
    this.name = "ExtensionUnavailableError";
    this.message =
      "A block needed an extension to produce a value, but no configured "
      + "extension recognizes its identity. Pass the extension to "
      + "`initialize({ extensions: [...] })`, or provide an explicit mock "
      + "for this block.";
  }
}

/**
 * The error thrown when more than one configured extension recognizes the
 * same identity.
 *
 * Refused rather than resolved by order. When two lambdas both match an
 * identity, TypeScript picks which one determines the block's type by its own
 * inference-candidate selection — not by the order the extensions were passed
 * in — so no runtime dispatch rule can be guaranteed to agree with the type
 * the caller was handed. Erroring at the point of use is the only outcome
 * that cannot silently disagree.
 */
export class AmbiguousIdentityError extends ExternError {
  constructor(
    /**
     * The names of the extensions that each claimed the identity.
     */
    public readonly extensions: ReadonlyArray<string>,
  ) {
    super();
    this.name = "AmbiguousIdentityError";
    this.message =
      `More than one extension recognizes this identity: `
      + `${extensions.join(", ")}. Extensions must claim disjoint sets of `
      + `identities — an overlap has no well-defined produced type.`;
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
    unused: ReadonlyArray<Spy>,
  ) {
    super();
    this.name = "UnusedMocksError";

    const details = unused
      .map(({ stack }, i) => `${i + 1}:\n${stack}`)
      .join("\n\n");

    this.message =
      `The testing block defined ${unused.length} mocks that did not get used:`
      + `\n\n${details}`;
  }
}
