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

async function loadTranslate() {
  vi.resetModules()
  return import('./translate')
}

describe('translation store', () => {
  afterEach(() => {
    localStorage.clear()
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

  it('drops a blank correction', async () => {
    const { cachedTranslation, saveTranslation } = await loadTranslate()
    saveTranslation('fold the corner', '   ')
    expect(cachedTranslation('fold the corner')).toBeNull()
    expect(localStorage.getItem(STORE_KEY)).toBeNull()
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
})
