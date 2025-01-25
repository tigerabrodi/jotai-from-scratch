# Thoughts/Learnings

I implemented Jotai from scratch to learn how it _really_ works.

I've also implemented [Zustand from scratch](https://github.com/tigerabrodi/zustand-from-scratch). I'm not gonna lie, implementing Jotai was 10x harder. Was it more fun? For sure. I love recursion, so that was a blast to have touched on today haha

There is a lot to unpack here, so I'll go over things at a high level.

If you wanna dig into the meat of it (I've documented it nicely), the two main files:

- [atoms.ts](https://github.com/tigerabrodi/jotai-from-scratch/blob/main/src/lib/atoms.ts)
- [useAtom.ts](https://github.com/tigerabrodi/jotai-from-scratch/blob/main/src/lib/useAtom.ts)

# Architecture

[PLACEHOLDER FOR VIDEO]

# A look from the outside

```js
const countAtom = atom(0)

// Derived atom - Depends on countAtom
const doubledAtom = atom((get) => get(countAtom) * 2)

// Derived atom - Depends on doubledAtom
const tripledAtom = atom((get) => get(doubledAtom) * 1.5)
```

How Jotai works: Each piece of state is an atom. An independent unit. Instead of one big store, you create small atoms. The reactivity system ensures that when a piece of state changes, all the atoms that depend on it are updated (and their components are re-rendered).

# High level explanation

## Atoms

At it's core, we have two different types of atoms:

- Primitive atoms
- Derived atoms

Primitive atoms are the ones that hold the actual state.

Derived atoms are the ones that are computed based on other atoms.

```ts
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
```

## Creating atoms

We have three different ways to create atoms:

1. `atom(value: TValue)` - Creates a primitive atom
2. `atom(read: (get: Get) => TValue)` - Creates a derived atom
3. `atom(read: (get: Get) => TValue, write: WriteFn<TValue>)` - Creates a derived atom with a write function

Since we use the same function for all three, we need function overloading to differentiate between them.

```ts
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
```

atomPrimitiveValues is a Map that holds the primitive values of the atoms.

### Branded types

You'll notice we have a `__brand` property on the atoms. This is a branded type. `__brand` is a phantom type. A phantom type is a type that is not used in the actual runtime, but is used for type inference. It's useful here so that TypeScript knows what type of value each atom holds.

### Primitive values

I struggled with the TypeScript type inference here. TypeScript had a hard time distinguishing between primitive and derived atoms. So I introduced a `Primitive` type.

```ts
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
```

Using type constraints, this worked fine. Although, a new issue rose. TypeScript tries to be VERY precise about the type. It's a good thing. We want strong type safety. But in this case, if you do `atom(0)` for example, we want that to be inferred as a `PrimitiveAtom<number>`. But TypeScript was inferring it as `PrimitiveAtom<0>`. That's why I needed the `Widen` type.

```ts
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
```

## Keeping track of global state

In `useAtom.ts`, you'll see a few global state variables:

- `currentlyComputingAtom`
- `subscriptions`
- `dependencies`

These are used to keep track of the currently computing atom, the subscriptions to an atom, and the dependencies of an atom.

It's worth noting that in a Map, you can store almost any value as a key. That's why we can store objects there as keys.

I think dependencies are worth talking about a bit more.

I explained it in the code already, but whenever an atom changes, we want to be able to immediately know which atoms need to be updated:

```ts
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
```

It's also worth noting that ONLY derived atoms have dependencies. Primitive atoms don't have them. Why? Because primitive atoms are the ones that hold the actual state. They don't need to know about other atoms. They are the source of truth.

## `useAtom`

`useAtom` isn't too interesting. You can dive into the code if you want.

I wanna go over how state is updated.

```js
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
```

Whenever setter function is called (second value from tuple returned by `useAtom`), we want to run the update.

If a user wants to updated a derived atom that has a write function, we use that to update the atom. This means every time they call `set` function in their write callback when creating the derived atom, they're calling `updateAtom`. If it doesn't exist for a derived atom, we throw an error.

If it's a primitive atom, we update it directly.

### How we write to atoms

There is quite an amount of code to go over and explain. I think looking at some interesting parts is enough.

```js
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
  // 1. First, we need to update the primitive atom's value
  atomPrimitiveValues.set(atom, newValue)

  // 2. Every component that depends on this atom will be re-rendered
  // Subscription is a function we get from useSyncExternalStore
  // When we call it, it knows to re-render the component
  subscriptions.get(atom)?.forEach((subscription) => subscription())

  // 3. We need to update all the derived atoms that depend on this atom
  const dependentAtoms = dependencies.get(atom)

  // If none exists, all good.
  if (!dependentAtoms) return

  // Every single derived atom that depends on this atom will be updated
  // We need to update them all because they might be read only derived atoms
  // And we need to re-compute their value (using their read functions via `atom.read`)
  dependentAtoms.forEach((dependentAtom) => {
    const castedDependentAtom = dependentAtom as AnyDerivedAtom
    updateReadonlyDerivedAtom(castedDependentAtom)
  })
}
```

`updateAtom` decides based on the atom type, how to update the atom. We could probably make it more type safe here to be clear and distinguish between read only vs writable derived atoms (that's something the actual Jotai does). It'd be better but I think for this implementation, it's ok.

The reason I brought it up is because if the atom we need to update is not a primitive atom, we know it's a read only derived atom since the writable one has its own update function (where it uses `updateAtom`).

### How we read from atoms

It's a lot of code to go over here. Let's start with the `get` function.

```js
const doubledAtom = atom((get) => get(countAtom) * 2)
```

Every time you use `get` in a derived atom, this specific derived atom needs to update its value whenever the getted atom changes. If `countAtom` changes, `doubledAtom` needs to update its value.

This means, we need to know:

1. The current atom that is being computed
2. The atom that is being getted

The atom that's being getted isn't hard to know. The one that's being computed is a bit harder. That's why we have `currentlyComputingAtom`.

---

```js
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
    // We do BACKTRACKING here
    // At each level when we're done, we restore the previous computing atom
    // "finally" because we restore even if errors happen
    // TIL: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/try...catch#the_finally_block
    // Finally is ALWAYS executed before returning the value or throwing an error
    currentlyComputingAtom = prevComputingAtom
  }
}
```

If you look at `getAtomValue`, if it's a primitive atom, we can just return the value directly.

If it's not a primitive atom, we need to call the atom's read function. Remember, the read function takes the get function as an argument. This means at this specific level when we call `atom.read(get)`, we need to update `currentlyComputingAtom` to the atom that's being updated. We essentially do backtracking here. We know that once we're done since it's recursive (`get` calls `getAtomValue` again), we need to restore the `currentlyComputingAtom` to the previous one.

If you're not too familiar with recursion and backtracking, I recommend reading my blog post: [DFS and BFS explained](https://tigerabrodi.blog/dfs-and-bfs-explained).

# Recap

If you really wanna know what's going on, feel free to dive into the code.
