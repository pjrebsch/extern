import type { $$Config } from "../Config";
import { UnusedMocksError } from "../Error";
import { mocking, type $$Mocker, type $$Spy, type $$SpyMap } from "../Mocking";
import { never, type Promisable } from "../Types";

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

const disallowUnusedMocks = (spiesBySchema: $$SpyMap) => {
  const unused: Array<$$Spy> = [];

  spiesBySchema.forEach((spies) => {
    spies.forEach((spy) => {
      switch (spy.kind) {
        case "skipped": {
          break;
        }
        case "mocked": {
          if (spy.executions.length === 0) unused.push(spy);
          break;
        }
        default: {
          never(spy);
        }
      }
    });
  });

  if (unused.length > 0) {
    throw new UnusedMocksError(unused);
  }
};
