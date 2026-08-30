import type { Initialized } from "@ghostry/extern";
import type { FabricatorLambda } from "../../src";

/**
 * Deliberately not a one-liner: real work around the block, so neither tail
 * elision nor inlining can plausibly remove this frame.
 */
export const loadUserService = <$T>(
  extern: Initialized<FabricatorLambda>,
  schema: Parameters<typeof extern.typed.by<$T>>[0],
): $T => {
  const started = Date.now();
  const audit: string[] = [];

  for (let i = 0; i < 3; i++) audit.push(`step-${i}-${started}`);

  const value = extern.typed.by(schema).will((): $T => {
    throw new Error("the original function must not run");
  }) as $T;

  if (audit.length !== 3) throw new Error("unreachable");

  return value;
};
