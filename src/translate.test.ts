import { afterEach, describe, expect, it, vi } from 'vitest'

const STORE_KEY = 'origami-presentation:v1:en:ru'
const HIDDEN_KEY = 'origami-presentation:v1:hidden'

interface Engine {
  translate: (input: string) => Promise<string>
}

function install(engine: Engine) {
  (globalThis as { Translator?: { create: () => Promise<Engine> } }).Translator = {
    create: async () => engine,
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

type GmListener = (...args: [string, unknown, unknown, boolean]) => void

async function loadTranslate() {
  vi.resetModules()
  return import('./translate')
}

describe('translation store', () => {
  afterEach(() => {
    localStorage.clear()
    clearGm()
    delete (globalThis as { Translator?: unknown }).Translator
  })

  it('saves a correction in the shared dictionary', async () => {
    const { cachedTranslation, saveTranslation } = await loadTranslate()
    saveTranslation('fold the corner', 'сложи угол иначе')
    expect(cachedTranslation('fold the corner')).toBe('сложи угол иначе')
    expect(JSON.parse(localStorage.getItem(STORE_KEY) ?? '')).toEqual({
      'fold the corner': 'сложи угол иначе',
    })
  })

  it('lists stored lines in source order and drops a forgotten one', async () => {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      'Fold the corner': 'сложи угол',
      'turn over': '   ',
      'crease the edge': 'сгиб края',
    }))
    const { invalidateTranslation, listTranslations, saveTranslation } = await loadTranslate()
    saveTranslation('open the paper', 'раскрой лист')
    expect(listTranslations()).toEqual([
      { source: 'crease the edge', value: 'сгиб края' },
      { source: 'Fold the corner', value: 'сложи угол' },
      { source: 'open the paper', value: 'раскрой лист' },
    ])
    invalidateTranslation('Fold the corner')
    expect(listTranslations()).toEqual([
      { source: 'crease the edge', value: 'сгиб края' },
      { source: 'open the paper', value: 'раскрой лист' },
    ])
  })

  it('drops a blank correction', async () => {
    const { cachedTranslation, saveTranslation } = await loadTranslate()
    saveTranslation('fold the corner', '   ')
    expect(cachedTranslation('fold the corner')).toBeNull()
    expect(localStorage.getItem(STORE_KEY)).toBeNull()
  })

  it('lists hidden lines in source order', async () => {
    const { hideCopy, listHidden, showCopy } = await loadTranslate()
    hideCopy('   ')
    hideCopy('Turn the paper')
    hideCopy('crease the edge')
    expect(listHidden()).toEqual(['crease the edge', 'Turn the paper'])
    showCopy('Turn the paper')
    expect(listHidden()).toEqual(['crease the edge'])
  })

  it('hides a line without turning it into an empty translation', async () => {
    const { cachedTranslation, hideCopy, isCopyHidden, saveTranslation } = await loadTranslate()
    saveTranslation('fold the corner', 'сложи угол')
    hideCopy('   ')
    hideCopy('fold the corner')
    expect(isCopyHidden('fold the corner')).toBe(true)
    expect(cachedTranslation('fold the corner')).toBe('сложи угол')
    expect(JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? '')).toEqual(['fold the corner'])
    const again = await loadTranslate()
    expect(again.isCopyHidden('fold the corner')).toBe(true)
    again.showCopy('fold the corner')
    expect(again.isCopyHidden('fold the corner')).toBe(false)
    expect(localStorage.getItem(HIDDEN_KEY)).toBeNull()
  })

  it('forgets a stored line so it can be translated again', async () => {
    const { cachedTranslation, hideCopy, invalidateTranslation, isCopyHidden, saveTranslation } = await loadTranslate()
    saveTranslation('fold the corner', 'сложи угол')
    hideCopy('fold the corner')
    invalidateTranslation('fold the corner')
    expect(cachedTranslation('fold the corner')).toBeNull()
    expect(isCopyHidden('fold the corner')).toBe(false)
    expect(localStorage.getItem(HIDDEN_KEY)).toBeNull()
    expect(JSON.parse(localStorage.getItem(STORE_KEY) ?? '')).toEqual({})
  })

  it('does not translate or replace a line that is already stored', async () => {
    const calls: string[] = []
    localStorage.setItem(STORE_KEY, JSON.stringify({ 'fold the corner': 'свой вариант' }))
    install({
      translate: (input) => {
        calls.push(input)
        return Promise.resolve('машинный')
      },
    })
    const { beginTranslation, cachedTranslation } = await loadTranslate()
    const session = await beginTranslation(() => {})
    await expect(session?.translate('fold the corner')).resolves.toBe('свой вариант')
    expect(calls).toEqual([])
    expect(cachedTranslation('fold the corner')).toBe('свой вариант')
    expect(JSON.parse(localStorage.getItem(STORE_KEY) ?? '')).toEqual({
      'fold the corner': 'свой вариант',
    })
  })

  it('keeps stored lines when a new line is translated', async () => {
    localStorage.setItem(STORE_KEY, JSON.stringify({ 'fold the corner': 'свой вариант' }))
    install({
      translate: () => Promise.resolve('машинный'),
    })
    const { beginTranslation, cachedTranslation } = await loadTranslate()
    expect(cachedTranslation('fold the corner')).toBe('свой вариант')
    localStorage.setItem(STORE_KEY, JSON.stringify({
      'fold the corner': 'новый свой',
      'turn the paper': 'чужой',
    }))
    const session = await beginTranslation(() => {})
    await expect(session?.translate('open the paper')).resolves.toBe('машинный')
    expect(JSON.parse(localStorage.getItem(STORE_KEY) ?? '')).toEqual({
      'fold the corner': 'новый свой',
      'turn the paper': 'чужой',
      'open the paper': 'машинный',
    })
    expect(cachedTranslation('fold the corner')).toBe('новый свой')
    expect(cachedTranslation('turn the paper')).toBe('чужой')
  })

  it('keeps a stored line when the engine answers for the same key', async () => {
    let finish: (value: string) => void = () => {}
    let started!: () => void
    const startedPromise = new Promise<void>((resolve) => {
      started = resolve
    })
    install({
      translate: () => {
        started()
        return new Promise((resolve) => {
          finish = resolve
        })
      },
    })
    const { beginTranslation, cachedTranslation } = await loadTranslate()
    const session = await beginTranslation(() => {})
    const pending = session?.translate('fold the corner')
    await startedPromise
    localStorage.setItem(STORE_KEY, JSON.stringify({ 'fold the corner': 'свой вариант' }))
    finish('машинный')
    await expect(pending).resolves.toBe('свой вариант')
    expect(cachedTranslation('fold the corner')).toBe('свой вариант')
    expect(JSON.parse(localStorage.getItem(STORE_KEY) ?? '')).toEqual({
      'fold the corner': 'свой вариант',
    })
  })

  it('keeps a saved correction when the engine answers later', async () => {
    let finish: (value: string) => void = () => {}
    let started!: () => void
    const startedPromise = new Promise<void>((resolve) => {
      started = resolve
    })
    install({
      translate: () => {
        started()
        return new Promise((resolve) => {
          finish = resolve
        })
      },
    })
    const { beginTranslation, cachedTranslation, saveTranslation } = await loadTranslate()
    const session = await beginTranslation(() => {})
    const pending = session?.translate('fold the corner')
    await startedPromise
    saveTranslation('fold the corner', 'свой вариант')
    finish('машинный')
    await expect(pending).resolves.toBe('свой вариант')
    expect(cachedTranslation('fold the corner')).toBe('свой вариант')
  })

  it('translates the original line again after a reset', async () => {
    const calls: string[] = []
    let finish: (value: string) => void = () => {}
    install({
      translate: (input) => {
        calls.push(input)
        return new Promise((resolve) => {
          finish = resolve
        })
      },
    })
    const { beginTranslation, cachedTranslation, invalidateTranslation, saveTranslation } = await loadTranslate()
    saveTranslation('fold the corner', 'старый вариант')
    const session = await beginTranslation(() => {})
    invalidateTranslation('fold the corner')
    const pending = session?.translate('fold the corner')
    await vi.waitFor(() => expect(calls).toEqual(['fold the corner']))
    finish('новый вариант')
    await expect(pending).resolves.toBe('новый вариант')
    expect(cachedTranslation('fold the corner')).toBe('новый вариант')
  })

  it('keeps a remote translation when this tab translates another line', async () => {
    const gm = installGm()
    install({
      translate: () => Promise.resolve('машинный'),
    })
    const { beginTranslation, cachedTranslation } = await loadTranslate()
    gm.remote(STORE_KEY, { 'fold the corner': 'чужой' })
    expect(cachedTranslation('fold the corner')).toBe('чужой')
    const session = await beginTranslation(() => {})
    await expect(session?.translate('open the paper')).resolves.toBe('машинный')
    expect(cachedTranslation('fold the corner')).toBe('чужой')
    const again = await loadTranslate()
    expect(again.cachedTranslation('fold the corner')).toBe('чужой')
    expect(again.cachedTranslation('open the paper')).toBe('машинный')
  })

  it('drops an in-flight machine translation when another tab stored the line', async () => {
    const calls: string[] = []
    const gm = installGm()
    install({
      translate: (input) => {
        calls.push(input)
        return Promise.resolve('машинный')
      },
    })
    const { beginTranslation } = await loadTranslate()
    const session = await beginTranslation(() => {})
    const pending = session?.translate('fold the corner')
    gm.remote(STORE_KEY, { 'fold the corner': 'чужой' })
    await expect(pending).resolves.toBe('чужой')
    await Promise.resolve()
    expect(calls).toEqual([])
    const again = await loadTranslate()
    expect(again.cachedTranslation('fold the corner')).toBe('чужой')
  })

  it('shows a line hidden in another tab', async () => {
    const gm = installGm()
    const { isCopyHidden } = await loadTranslate()
    expect(isCopyHidden('fold the corner')).toBe(false)
    gm.remote(HIDDEN_KEY, ['fold the corner'])
    expect(isCopyHidden('fold the corner')).toBe(true)
  })
})
