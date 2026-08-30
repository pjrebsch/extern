import type { Initialized } from "@ghostry/extern";
import type { FabricatorLambda } from "../../src";

/**
 * Opens a testing block from a *different file* than the suite that calls this.
 *
 * The seed layer this extension applies is keyed on the file that called into
 * extern — the `testing()` call site, `:line:col` stripped — so an identical
 * block run from here must draw differently from one run in the test file
 * itself. That is what keeps one file's fabricated data from shifting when an
 * unrelated file gains or loses a test.
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
