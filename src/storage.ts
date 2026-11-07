const DICTIONARY_KEY = 'origami-presentation:v1:en:ru'
const HIDDEN_KEY = 'origami-presentation:v1:hidden'
const missing = Symbol('missing')

type DictionaryRecord = Record<string, string>

export type StoreEvent = {
  kind: 'dictionary'
  value: DictionaryRecord
} | {
  kind: 'hidden'
  value: string[]
}

type GmListener = (...args: [string, unknown, unknown, boolean]) => void
type GmGet = (name: string, defaultValue?: unknown) => unknown
type GmSet = (name: string, value: unknown) => void
type GmListen = (name: string, callback: GmListener) => unknown

const listeners = new Set<(event: StoreEvent) => void>()
let gmReady: boolean | null = null
let listening = false

function hasGm() {
  if (gmReady !== null) return gmReady
  gmReady = typeof GM_getValue === 'function'
    && typeof GM_setValue === 'function'
    && typeof GM_deleteValue === 'function'
    && typeof GM_addValueChangeListener === 'function'
  return gmReady
}

function gmGet(key: string) {
  const read = GM_getValue as GmGet
  return read(key, missing)
}

function gmSet(key: string, value: unknown) {
  const write = GM_setValue as GmSet
  write(key, value)
}

function gmDelete(key: string) {
  GM_deleteValue(key)
}

function gmListen(key: string, listener: GmListener) {
  const listen = GM_addValueChangeListener as GmListen
  listen(key, listener)
}

function parseLocal(text: string | null) {
  if (!text) return
  try {
    return JSON.parse(text) as unknown
  } catch {
    // A broken record is ignored until the next successful write.
  }
}

function readLocal(key: string) {
  try {
    return parseLocal(localStorage.getItem(key))
  } catch {
    // Storage can be blocked. A missing record reads as empty.
  }
}

function dictionaryFrom(value: unknown) {
  const store: DictionaryRecord = {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) return store
  for (const [source, translated] of Object.entries(value)) {
    if (typeof translated !== 'string' || !translated.trim()) continue
    store[source] = translated
  }
  return store
}

function hiddenFrom(value: unknown) {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const list: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    const source = item.trim()
    if (!source || seen.has(source)) continue
    seen.add(source)
    list.push(source)
  }
  return list
}

function readRaw(key: string) {
  if (!hasGm()) return readLocal(key)
  try {
    return gmGet(key)
  } catch {
    return missing
  }
}

function writeRaw(key: string, value: unknown) {
  if (!hasGm()) {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // Storage can be full or blocked. The memory copy still covers this visit.
    }
    return
  }
  try {
    gmSet(key, value)
  } catch {
    // The userscript store can reject a value. The memory copy still covers this visit.
  }
}

function removeRaw(key: string) {
  if (!hasGm()) {
    try {
      localStorage.removeItem(key)
    } catch {
      // Storage can be blocked. The memory copy still covers this visit.
    }
    return
  }
  try {
    gmDelete(key)
  } catch {
    // The userscript store can reject a delete. The memory copy still covers this visit.
  }
}

function emit(key: string, raw: unknown) {
  if (key === DICTIONARY_KEY) {
    const value = dictionaryFrom(raw)
    for (const listener of listeners) listener({ kind: 'dictionary', value })
    return
  }
  if (key !== HIDDEN_KEY) return
  const value = hiddenFrom(raw)
  for (const listener of listeners) listener({ kind: 'hidden', value })
}

function onGmChange(...args: [string, unknown, unknown, boolean]) {
  const remote = args[3]
  if (!remote) return
  emit(args[0], args[2])
}

function onStorage(event: StorageEvent) {
  if (event.storageArea && event.storageArea !== localStorage) return
  if (event.key !== DICTIONARY_KEY && event.key !== HIDDEN_KEY) return
  emit(event.key, parseLocal(event.newValue))
}

function arm() {
  if (listening) return
  listening = true
  if (hasGm()) {
    gmListen(DICTIONARY_KEY, onGmChange)
    gmListen(HIDDEN_KEY, onGmChange)
    return
  }
  window.addEventListener('storage', onStorage)
}

export function readDictionary() {
  arm()
  const raw = readRaw(DICTIONARY_KEY)
  if (raw === missing || raw === undefined) return {}
  return dictionaryFrom(raw)
}

export function writeDictionary(value: DictionaryRecord) {
  arm()
  writeRaw(DICTIONARY_KEY, { ...value })
}

export function readHidden() {
  arm()
  const raw = readRaw(HIDDEN_KEY)
  if (raw === missing || raw === undefined) return []
  return hiddenFrom(raw)
}

export function writeHidden(values: readonly string[]) {
  arm()
  const list = hiddenFrom(values)
  if (list.length === 0) {
    removeRaw(HIDDEN_KEY)
    return
  }
  writeRaw(HIDDEN_KEY, list)
}

export function subscribeStore(listener: (event: StoreEvent) => void) {
  arm()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
