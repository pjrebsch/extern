import type { $$Config } from "../Config";
import { UnusedMocksError } from "../Error";
import { mocking, type $$Mocker } from "../Mocking";
import type { $$Map, $$Spy } from "../Spy";
import { type Promisable } from "../Types";

export type $$Testing = (
  fn: (mocker: $$Mocker) => Promisable<void>,
) => Promise<void>;

export const $$testing =
  (config: $$Config): $$Testing =>
  async (fn: (mocker: $$Mocker) => Promisable<void>): Promise<void> => {
    const { mock, spies } = mocking();
    await config.scope.run({ spies }, async () => fn(mock));

    disallowUnusedMocks(spies);
  };

const disallowUnusedMocks = (spyMap: $$Map) => {
  const unused: Array<$$Spy> = [];

  const check = (spy: $$Spy) => {
    if (spy.executions.length === 0) unused.push(spy);
  };

  spyMap.effects.forEach(check);
  spyMap.forEach((spies) => spies.forEach(check));

  if (unused.length > 0) {
    throw new UnusedMocksError(unused);
  }
};
