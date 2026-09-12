import type { Initialized } from "@ghostry/extern";
import type { FabricatorLambda } from "../../src";

/**
 * Opens a testing block from a *different file* than the suite that calls this.
 *
 * Each testing block gets a fresh construction counter without a file-derived
 * salt, so an identical block run here draws the same value as one run in the
 * test file itself.
 */
export const fabricateElsewhere = async <$T>(
  extern: Initialized<FabricatorLambda>,
  schema: Parameters<typeof extern.typed.by<$T>>[0],
): Promise<$T> => {
  let value: $T | undefined;

  await extern.testing(() => {
    value = extern.typed.by(schema).will((): $T => {
      throw new Error("unreachable");
    }) as $T;
  });

  return value!;
};
