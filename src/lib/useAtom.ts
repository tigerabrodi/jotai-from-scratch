import { useSyncExternalStore } from 'react'
import {
  AnyAtom,
  AnyDerivedAtom,
  atomPrimitiveValues,
  PrimitiveAtom,
  type Atom,
} from './atoms'

// Holds the currently computing atom
export let currentlyComputingAtom: AnyAtom | null = null

// Subscriptions is how we track WHICH components are subscribed to an atom
// Multiple components can be subscribed to the same atom
// Think two different components calling useAtom(atom)
export const subscriptions = new Map<AnyAtom, Set<() => void>>()

// Dependencies are different from subscriptions
// They have nothing to do with components
// They are ONLY for derived atoms
// Primitive atoms don't have dependencies!
// For derives atoms, we look at atoms THAT depend on them
// It can be confusing, another approach would be to reverse the dependency graph
// Then you'd have for every atom, a list of atoms that they depend on
// The problem here is that you need to traverse the graph backwards
// Whenever an atom changes, whether primitive or derived, with the current approach,
// ...we can immediately answer the question: "What needs to update when this atom changes?"
export const dependencies = new Map<AnyAtom, Set<AnyAtom>>()

function get<TValue>(atom: Atom<TValue>): TValue {
  // If we're computing an atom (running its read function)
  // and it calls "get" on another atom, track that dependency
  // e.g. get(countAtom) * 2
  // If countAtom changes, we need to recompute currentlyComputingAtom
  // If it's the first time we're computing an atom (top level)
  // ...we can just call getAtomValue(atom)
  // If it's a primitive atom, it will return its value directly
  // If NOT, we call atom.read(get)
  // `get` uses the getAtomValue function, so currentlyComputingAtom will be the first derived atom being computed
  if (currentlyComputingAtom) {
    // currentlyComputingAtom depends on atom
    if (!dependencies.has(atom)) {
      dependencies.set(atom, new Set())
    }

    // currentlyComputingAtom should update every time atom is updated
    dependencies.get(atom)!.add(currentlyComputingAtom)
  }

  return getAtomValue(atom)
}

function getAtomValue<TValue>(atom: Atom<TValue>): TValue {
  if (atom.type === 'primitive') {
    return atomPrimitiveValues.get(atom) as TValue
  }

  // Set the current computing atom before running read
  const prevComputingAtom = currentlyComputingAtom
  currentlyComputingAtom = atom

  try {
    return atom.read(get)
    // An example:
    // 1. Calls the function: get => get(countAtom) * 2
    // 2. Inside that function, get(countAtom) is called
    // 3. get() calls getAtomValue(countAtom) - By now, we've already set currentlyComputingAtom to the atom that depends on countAtom
    // 4. Since countAtom is primitive, returns its value
    // 5. Then multiplies by 2
  } finally {
    // Restore previous computing atom
    // We do backtracking here
    // At each level when we're done, we restore the previous computing atom
    // "finally" because we restore even if errors happen
    // TIL: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/try...catch#the_finally_block
    // Finally is ALWAYS executed before returning the value or throwing an error
    currentlyComputingAtom = prevComputingAtom
  }
}

function updateAtom<TValue>(atom: AnyAtom, newValue: TValue) {
  if (atom.type === 'primitive') {
    updatePrimitiveAtom(atom, newValue)
    return
  }

  updateReadonlyDerivedAtom(atom)
}

function updatePrimitiveAtom<TValue>(
  atom: PrimitiveAtom<TValue>,
  newValue: TValue
) {
  atomPrimitiveValues.set(atom, newValue)

  subscriptions.get(atom)?.forEach((subscription) => subscription())

  const dependentAtoms = dependencies.get(atom)

  if (!dependentAtoms) return

  dependentAtoms.forEach((dependentAtom) => {
    const castedDependentAtom = dependentAtom as AnyDerivedAtom
    updateReadonlyDerivedAtom(castedDependentAtom)
  })
}

// We don't need to pass newValue here
// Why?
// Because readonly derived atoms are computed by the read function
// We'll end up calling getAtomValue(atom) again
function updateReadonlyDerivedAtom(atom: AnyDerivedAtom) {
  subscriptions.get(atom)?.forEach((subscription) => subscription())

  const dependentAtoms = dependencies.get(atom)

  if (!dependentAtoms) return

  dependentAtoms.forEach((dependentAtom) => {
    updateReadonlyDerivedAtom(dependentAtom as AnyDerivedAtom)
  })
}

type SetValueFn<TValue> = (prev: TValue) => TValue

export function useAtom<TValue>(
  atom: Atom<TValue>
): [TValue, (value: TValue | SetValueFn<TValue>) => void] {
  const subscribe = (callback: () => void) => {
    // Add this component's callback to atom's subscriptions
    if (!subscriptions.has(atom)) {
      subscriptions.set(atom, new Set())
    }

    subscriptions.get(atom)!.add(callback)

    // Return cleanup function
    // Called when component unmounts
    return () => {
      subscriptions.get(atom)?.delete(callback)
    }
  }

  // Useful information to know for ALL atoms:
  // This is honestly more or less how useSyncExternalStore works
  // Every time we call subscription() e.g. subscriptions.get(atom)?.forEach((subscription) => subscription())
  // The component will be re-rendered ONLY if the previous snapshot is different from the current snapshot
  // This is important during updates
  // Otherwise the component will never be re-rendered (if you don't notify the component)
  // getAtomValue(atom) gives us the current value of the atom
  const getSnapshot = () => {
    return getAtomValue(atom)
  }

  const value = useSyncExternalStore(subscribe, getSnapshot)

  const setValue = (nextValue: TValue | SetValueFn<TValue>) => {
    const newValue =
      typeof nextValue === 'function'
        ? (nextValue as SetValueFn<TValue>)(getAtomValue(atom))
        : nextValue

    if (atom.type === 'derived' && atom.write) {
      // If it's derived with write function, use that
      // From users' pov (get, set, {newValue}) => {}
      // `set` is the updateAtom function
      atom.write(get, updateAtom, newValue)
    } else if (atom.type === 'primitive') {
      // If primitive, update directly
      updateAtom(atom, newValue)
    } else {
      // Derived without write function: read only!
      throw new Error('Cannot set read-only derived atom')
    }
  }

  return [value, setValue] as const
}

export function useAtomValue<TValue>(atom: Atom<TValue>): TValue {
  const [value] = useAtom(atom)
  return value
}
