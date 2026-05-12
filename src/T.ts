declare const brand: unique symbol;

class TypeIdentity<$T> {
  declare private readonly [brand]: $T;
}

export type T<$T> = TypeIdentity<$T>;

export const T = <$T>(): TypeIdentity<$T> => new TypeIdentity<$T>();
