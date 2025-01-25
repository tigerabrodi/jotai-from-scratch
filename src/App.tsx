import { atom } from './lib/atoms'
import { useAtom, useAtomValue } from './lib/useAtom'

function App() {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: '400px',
        minHeight: '100vh',
        width: '100vw',
        padding: '60px',
      }}
    >
      <Counter />
      <DoubleView />
      <TripleView />
      <Counter2 />
      <Counter3 />
    </div>
  )
}

const countAtom = atom(0)

const countAtom2 = atom(0)

const doubledAtom = atom((get) => get(countAtom) * 2)

const tripledAtom = atom((get) => get(doubledAtom) * 1.5)

const countAtom3WithWrite = atom(
  (get) => get(countAtom) * 2,
  (get, set, newValue) => {
    const currentCount = get(countAtom)
    set(countAtom, currentCount + newValue)
  }
)

function Counter() {
  const [count, setCount] = useAtom(countAtom)
  // subscribes to countAtom via useSyncExternalStore
  return <button onClick={() => setCount(count + 1)}>{count}</button>
}

function Counter2() {
  const [count, setCount] = useAtom(countAtom2)
  // subscribes to countAtom via useSyncExternalStore
  return <button onClick={() => setCount(count + 1)}>{count}</button>
}

function Counter3() {
  const [count, setCount] = useAtom(countAtom3WithWrite)
  return <button onClick={() => setCount(5)}>{count}</button>
}

function DoubleView() {
  const doubled = useAtomValue(doubledAtom)
  // subscribes to doubledAtom
  return <div>{doubled}</div>
}

function TripleView() {
  const tripled = useAtomValue(tripledAtom)
  // subscribes to tripledAtom
  return <div>{tripled}</div>
}

export default App
