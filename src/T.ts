declare const brand: unique symbol;

class T<$T> {
  declare private readonly [brand]: $T;
}

export type $$T<$T> = T<$T>;

export const $$T = <$T>(): $$T<$T> => new T<$T>();
