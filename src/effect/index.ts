import type { $$Config } from "../Config";
import { $$named } from "./named";
import { $$will } from "./will";

export interface $$Effect {
  named: $$named;
  will: $$will;
}

export const $$effect = (config: $$Config): $$Effect => ({
  named: $$named(config),
  will: $$will(config),
});
