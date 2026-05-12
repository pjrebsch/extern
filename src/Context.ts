import type { IdentityMap } from "./Spy";

export interface Context {
  readonly spies: IdentityMap;
}
