import { fromConfiguration, type $$Configuration } from "./Config";
import { $$effect, type $$Effect } from "./effect";
import { $$T } from "./T";
import { $$testing, type $$Testing } from "./testing";
import { $$typed, type $$Typed } from "./typed";
import { $$validated, type $$Validated } from "./validated";

export type { $$Configuration as Configuration } from "./Config.ts";

export type { $$Execution as Execution, $$Spy as Spy } from "./Spy";

export type { $$Mocker as Mocker } from "./Mocking.ts";

export { $$T as T } from "./T";

export type {
  DuplicateMockError,
  ExternError,
  IllegalConcurrencyTestingError,
  InvalidDataTypeError,
  NotMockedError,
  UnusedMocksError,
} from "./Error.ts";

/**
 * Initialization of the library provides this interface.
 */
export interface Initialized {
  /**
   * Start defining an extern block in `validated` mode.
   */
  readonly validated: $$Validated;

  /**
   * Start defining an extern block in `typed` mode.
   */
  readonly typed: $$Typed;

  /**
   * Start defining an extern block in `effect` mode.
   */
  readonly effect: $$Effect;

  /**
   * Run a supplied function in a testing context in which to mock source
   * extern blocks.
   */
  readonly testing: $$Testing;

  /**
   * Build a type-only stand-in for a real schema, usable as the identity
   * passed to `typed.by()` (and `mock()` inside a testing block).
   */
  readonly T: typeof $$T;
}

/**
 * Initializes an instance of the usable library API according to the
 * provided configuration.
 */
export const initialize = async (
  config: $$Configuration = {},
): Promise<Initialized> => {
  const $config = await fromConfiguration(config);

  return {
    validated: $$validated($config),
    typed: $$typed($config),
    effect: $$effect($config),
    testing: $$testing($config),
    T: $$T,
  };
};
