import { fromConfiguration, type Configuration } from "./Config.ts";
import { effect, type Effect } from "./effect/index.ts";
import { T } from "./T.ts";
import { testing, type Testing } from "./testing/index.ts";
import { typed, type Typed } from "./typed/index.ts";
import { validated, type Validated } from "./validated/index.ts";

export type { Configuration } from "./Config.ts";

export type { Execution, Spy } from "./Spy.ts";

export type { Mocker } from "./Mocking.ts";

export { T } from "./T.ts";

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
  readonly validated: Validated;

  /**
   * Start defining an extern block in `typed` mode.
   */
  readonly typed: Typed;

  /**
   * Start defining an extern block in `effect` mode.
   */
  readonly effect: Effect;

  /**
   * Run a supplied function in a testing context in which to mock source
   * extern blocks.
   */
  readonly testing: Testing;

  /**
   * Build a type-only stand-in for a real schema, usable as the identity
   * passed to `typed.by()` (and `mock()` inside a testing block).
   */
  readonly T: typeof T;
}

/**
 * Initializes an instance of the usable library API according to the
 * provided configuration.
 */
export const initialize = async (
  config: Configuration = {},
): Promise<Initialized> => {
  const $config = await fromConfiguration(config);

  return {
    validated: validated($config),
    typed: typed($config),
    effect: effect($config),
    testing: testing($config),
    T,
  };
};
