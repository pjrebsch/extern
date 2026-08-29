import type { Config } from "../Config";
import { UnusedMocksError } from "../Error";
import { mocking, type Mocker } from "../Mocking";
import type { IdentityMap, Spy } from "../Spy";
import { never, type Promisable } from "../Types";

export type Testing = (
  fn: (mocker: Mocker) => Promisable<void>,
) => Promise<void>;

export const testing =
  (config: Config): Testing =>
  async (fn: (mocker: Mocker) => Promisable<void>): Promise<void> => {
    const { mock, spies } = mocking();

    await config.scope.run({ spies }, async () => fn(mock));

    disallowUnusedMocks(spies);
  };

const disallowUnusedMocks = (spyMap: IdentityMap) => {
  const unused: Array<Spy> = [];

  const check = (spy: Spy) => {
    switch (spy.options.unused) {
      case "allow":
        return;
      case undefined:
      case "error":
        if (spy.executions.length === 0) unused.push(spy);
        return;
      default:
        never(spy.options.unused);
    }
  };

  spyMap.effects.forEach(check);
  spyMap.forEach((spies) => spies.forEach(check));

  if (unused.length > 0) {
    throw new UnusedMocksError(unused);
  }
};
