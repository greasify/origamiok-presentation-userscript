import { afterEach, describe, expect, it, vi } from 'vitest'

const STORE_KEY = 'origami-presentation:v1:en:ru'
const HIDDEN_KEY = 'origami-presentation:v1:hidden'

type GmListener = (...args: [string, unknown, unknown, boolean]) => void

function installGm() {
  const values = new Map<string, unknown>()
  const listeners = new Map<string, Set<GmListener>>()
  const fire = (name: string, value: unknown, remote: boolean) => {
    const oldValue = values.get(name)
    if (value === undefined) values.delete(name)
    else values.set(name, value)
    listeners.get(name)?.forEach(listener => listener(name, oldValue, value, remote))
  }
  const scope = globalThis as Record<string, unknown>
  scope.GM_getValue = (name: string, fallback?: unknown) => values.has(name) ? values.get(name) : fallback
  scope.GM_setValue = (name: string, value: unknown) => fire(name, value, false)
  scope.GM_deleteValue = (name: string) => fire(name, undefined, false)
  scope.GM_addValueChangeListener = (name: string, listener: GmListener) => {
    const group = listeners.get(name) ?? new Set<GmListener>()
    group.add(listener)
    listeners.set(name, group)
    return group.size
  }
  scope.GM_removeValueChangeListener = () => {}
  return {
    remote(name: string, value: unknown) {
      fire(name, value, true)
    },
  }
}

function clearGm() {
  const scope = globalThis as Record<string, unknown>
  delete scope.GM_getValue
  delete scope.GM_setValue
  delete scope.GM_deleteValue
  delete scope.GM_addValueChangeListener
  delete scope.GM_removeValueChangeListener
}

async function loadStorage() {
  vi.resetModules()
  return import('./storage')
}

describe('script storage', () => {
  afterEach(() => {
    localStorage.clear()
    clearGm()
  })

  it('reports a remote change and ignores a local write', async () => {
    const gm = installGm()
    const { subscribeStore, writeDictionary } = await loadStorage()
    const seen: string[] = []
    subscribeStore((event) => {
      if (event.kind !== 'dictionary') return
      seen.push(event.value['fold the corner'] ?? '')
    })
    writeDictionary({ 'fold the corner': 'свой' })
    expect(seen).toEqual([])
    gm.remote(STORE_KEY, { 'fold the corner': 'чужой' })
    expect(seen).toEqual(['чужой'])
  })

  it('reports a remote hidden list', async () => {
    const gm = installGm()
    const { readHidden, subscribeStore } = await loadStorage()
    const seen: string[][] = []
    subscribeStore((event) => {
      if (event.kind === 'hidden') seen.push(event.value)
    })
    gm.remote(HIDDEN_KEY, ['fold the corner', '  '])
    expect(seen).toEqual([['fold the corner']])
    expect(readHidden()).toEqual(['fold the corner'])
  })

  it('follows a storage event when GM is missing', async () => {
    const { readDictionary, subscribeStore, writeDictionary } = await loadStorage()
    writeDictionary({ 'fold the corner': 'свой' })
    const seen: string[] = []
    subscribeStore((event) => {
      if (event.kind !== 'dictionary') return
      seen.push(event.value['fold the corner'] ?? '')
    })
    const next = JSON.stringify({ 'fold the corner': 'чужой' })
    localStorage.setItem(STORE_KEY, next)
    window.dispatchEvent(new StorageEvent('storage', { key: STORE_KEY, newValue: next }))
    expect(seen).toEqual(['чужой'])
    expect(readDictionary()).toEqual({ 'fold the corner': 'чужой' })
  })
})
