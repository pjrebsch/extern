export type Promisable<$T> = $T | Promise<$T>;

export type Promised<$T, $Promisable extends Promisable<$T>> =
  $Promisable extends Promise<$T> ? Promise<$T> : $T;

export type $$Name = string;

export type $$Mode = "typed" | "validated" | "effect";

export namespace $$Disambiguation {
  type $$Base = { readonly named: string };

  export type $$ForValue = Partial<$$Base>;
  export type $$ForEffect = Required<$$Base>;
}

export namespace $$Params {
  type $$Base<$In> = { readonly given?: $In };

  export type $$ForValue<$In> = $$Base<$In> & $$Disambiguation.$$ForValue;
  export type $$ForEffect<$In> = $$Base<$In> & $$Disambiguation.$$ForEffect;
}

export const never = (never: never): never => never;
