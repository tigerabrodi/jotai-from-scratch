// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyPrimitiveAtom = PrimitiveAtom<any>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyDerivedAtom = DerivedAtom<any>
export type AnyAtom = AnyPrimitiveAtom | AnyDerivedAtom
export type AnyValue = unknown

export type Get = {
  <TValue>(atom: PrimitiveAtom<TValue>): TValue
  <TValue>(atom: DerivedAtom<TValue>): TValue
}
export type Set = <TValue>(atom: Atom<TValue>, value: TValue) => void

// `get` is a function that useAtom passes to the read function
// It will first store the current atom as a dependency of the atom it's trying to "get"
// Then it runs the `getAtomValue` function to get the actual value
export type ReadFn<TValue> = (get: Get) => TValue

// `set` function is kind of the same as ReadFn
// However, with `set`, we don't need to worry about dependencies
// So what we'll do is whenever that atom updates via `set`
// We look at all its dependencies and make sure they're recomputed
export type WriteFn<TValue> = (get: Get, set: Set, newValue: TValue) => void

// Branded type so that typescript knows what type of value each atom holds
export type PrimitiveAtom<TValue> = {
  type: 'primitive'
  __brand: TValue
}

export type DerivedAtom<TValue> = {
  type: 'derived'
  read: ReadFn<TValue>
  write?: WriteFn<TValue>
}

export type Atom<TValue> = PrimitiveAtom<TValue> | DerivedAtom<TValue>

// We only need map for primitive atoms
// Why?
// Because derived atoms are computed by reading either other derived atoms OR primitive atoms
// Derived atoms use their own values/state in combination with other atoms
// Drilling down into an atom will end up being a primitive atom
// Changing a primitive atom will trigger a recomputation of all derived atoms that depend on it (this is important to grasp)
// Even though every key in the map has the same shape, the reference is different
// Therefore it's fine
export const atomPrimitiveValues = new Map<AnyPrimitiveAtom, AnyValue>()

// Needed otherwise typescript will narrow down the type too far
// e.g. atom(0) -> will be seen as 0, not a number
type Widen<PrimitiveValue> = PrimitiveValue extends number
  ? number
  : PrimitiveValue extends string
    ? string
    : PrimitiveValue extends boolean
      ? boolean
      : PrimitiveValue extends bigint
        ? bigint
        : PrimitiveValue extends symbol
          ? symbol
          : PrimitiveValue

// We use primitive for the function overloading
// The reason this is used for the first case is because otherwise TypeScript when inferring can't differentiate when it should return Derived or Primitive atom
// This was an annoying thing to debug
// Just figured it out by trial and error to be honest xD
type Primitive =
  | string
  | number
  | boolean
  | null
  | undefined
  | bigint
  | symbol
  | Date
  | RegExp

export function atom<TValue extends Primitive>(
  value: TValue
): PrimitiveAtom<Widen<TValue>>
export function atom<TReturn>(read: (get: Get) => TReturn): DerivedAtom<TReturn>
export function atom<TReturn>(
  read: (get: Get) => TReturn,
  write: WriteFn<TReturn>
): DerivedAtom<TReturn>

export function atom<TValue>(
  configOrRead: TValue | ReadFn<TValue>,
  write?: WriteFn<TValue>
): Atom<TValue> {
  if (typeof configOrRead === 'function') {
    return {
      type: 'derived',
      read: configOrRead as ReadFn<TValue>,
      // Write is optional
      // Hence it's ok
      // If not provided, it's a read-only derived atom!
      write,
    }
  }

  const atom: PrimitiveAtom<TValue> = {
    type: 'primitive',
    __brand: configOrRead,
  }

  atomPrimitiveValues.set(atom, configOrRead)
  return atom
}
