import { fromConfiguration, type $$Configuration } from "./Config";
import { $$testing, type $$Testing } from "./testing";
import { $$typed, type $$Typed } from "./typed";
import { $$validated, type $$Validated } from "./validated";

export type { $$Configuration as Configuration } from "./Config.ts";

export type {
  $$Execution as Execution,
  $$Mocker as Mocker,
  $$Spy as Spy,
} from "./Mocking.ts";

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
  validated: $$Validated;
  typed: $$Typed;
  testing: $$Testing;
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
    testing: $$testing($config),
  };
};
