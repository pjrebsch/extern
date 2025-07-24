export type Promisable<T> = T | Promise<T>;

export type $$Name = string;

export type $$Mode = "typed" | "validated";

export interface $$Disambiguation {
  readonly named?: string;
  readonly at?: number;
}

export type $$Params<$In> = $$Disambiguation & { given?: $In };
