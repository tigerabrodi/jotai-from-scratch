```tsx
const countAtom = atom(0)
const doubledAtom = atom((get) => {
  // When this runs:
  const count = get(countAtom)
  // 1. We need to add doubledAtom as a dependency of countAtom
  // 2. So when countAtom changes, we know we need to recompute doubledAtom
  return count * 2
})

// Later when components use these:
function Counter() {
  const [count] = useAtom(countAtom) // adds to subscriptions
  const doubled = useAtomValue(doubledAtom) // adds to subscriptions
  // Now countAtom's subscriptions has Counter
  // doubledAtom's subscriptions has Counter
  return (
    <div>
      {count} - {doubled}
    </div>
  )
}

function AnotherCounter() {
  const doubled = useAtomValue(doubledAtom)
  // Same doubledAtom, different component!
  // doubledAtom's subscriptions now has both Counter AND AnotherCounter
  return <div>{doubled}</div>
}
```
