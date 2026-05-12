declare const brand: unique symbol;

class TypeIdentity<$T> {
  declare private readonly [brand]: $T;
}

export const T = <$T>(): TypeIdentity<$T> => new TypeIdentity<$T>();

/**
 * A library-native type identity.
 */
export type T<$T> = TypeIdentity<$T>;
