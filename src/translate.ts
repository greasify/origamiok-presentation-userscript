import {
  readDictionary,
  readHidden,
  subscribeStore,
  writeDictionary,
  writeHidden,
} from './storage'

export interface TranslationSession {
  translate: (text: string, priority?: number) => Promise<string>
  prioritize: (texts: readonly string[]) => void
}

interface DownloadProgressEvent extends Event {
  loaded?: number
  total?: number
}

interface ModelMonitor {
  addEventListener: (
    type: 'downloadprogress',
    listener: (event: DownloadProgressEvent) => void,
  ) => void
}

interface TranslatorEngine {
  translate: (input: string) => Promise<string>
  destroy?: () => void
}

interface LanguagePair {
  sourceLanguage: string
  targetLanguage: string
}

interface TranslatorApi {
  availability?: (options: LanguagePair) => Promise<string>
  create: (options: LanguagePair & {
    monitor?: (monitor: ModelMonitor) => void
  }) => Promise<TranslatorEngine>
}

interface Job {
  text: string
  priority: number
  resolvers: Array<(value: string) => void>
}

const SOURCE = 'en'
const TARGET = 'ru'

const memory = new Map<string, string>()
const pending = new Map<string, Job>()
const revision = new Map<string, number>()
const explicit = new Map<string, string | null>()
const filled = new Set<string>()
const watchers = new Set<() => void>()
let dictionary: Record<string, string> | null = null
let hidden: Set<string> | null = null
let active = 0
let scheduled = false
let engine: TranslatorEngine | null = null
let sessionPromise: Promise<TranslationSession | null> | null = null
let progressListener: (loaded: number) => void = () => {}

function readStored() {
  return readDictionary()
}

function remember(store: Record<string, string>) {
  dictionary = store
  for (const key of memory.keys()) {
    if (!store[key]) memory.delete(key)
  }
  for (const [key, value] of Object.entries(store)) memory.set(key, value)
  for (const key of filled) {
    if (!store[key]) filled.delete(key)
  }
}

function persistDictionary() {
  if (!dictionary) return
  const fresh = readStored()
  const merged: Record<string, string> = { ...fresh }
  for (const key of filled) {
    const value = dictionary[key]
    if (value && !fresh[key]) merged[key] = value
  }
  for (const [key, value] of explicit) {
    if (value == null) delete merged[key]
    else merged[key] = value
  }
  writeDictionary(merged)
  remember(merged)
}

function loadDictionary() {
  if (!dictionary) dictionary = {}
  const fresh = readStored()
  for (const [key, value] of Object.entries(fresh)) {
    if (!explicit.has(key)) dictionary[key] = value
  }
  for (const [key, value] of explicit) {
    if (value == null) delete dictionary[key]
    else dictionary[key] = value
  }
  for (const key of Object.keys(dictionary)) {
    if (fresh[key] || explicit.has(key) || filled.has(key)) continue
    delete dictionary[key]
    memory.delete(key)
  }
  return dictionary
}

export function listTranslations() {
  const pairs: Array<{ source: string, value: string }> = []
  for (const [source, value] of Object.entries(loadDictionary())) {
    const translated = value.trim()
    if (!source.trim() || !translated) continue
    pairs.push({ source, value: translated })
  }
  pairs.sort((left, right) => left.source.localeCompare(right.source, 'en', { sensitivity: 'base' }))
  return pairs
}

export function cachedTranslation(text: string) {
  const trimmed = text.trim()
  if (!trimmed) return null
  if (explicit.get(trimmed) === null) return null
  const hit = loadDictionary()[trimmed]
  if (!hit) return null
  memory.set(trimmed, hit)
  return hit
}

function rev(text: string) {
  return revision.get(text) ?? 0
}

function bump(text: string) {
  revision.set(text, rev(text) + 1)
}

function fillTranslation(text: string, translated: string) {
  if (explicit.get(text) === null) explicit.delete(text)
  const existing = cachedTranslation(text)
  if (existing) return existing
  filled.add(text)
  loadDictionary()[text] = translated
  memory.set(text, translated)
  persistDictionary()
  return translated
}

export function saveTranslation(text: string, translated: string) {
  const source = text.trim()
  const value = translated.trim()
  if (!source || !value) return
  bump(source)
  explicit.set(source, value)
  filled.delete(source)
  loadDictionary()[source] = value
  memory.set(source, value)
  persistDictionary()
  const job = pending.get(source)
  if (!job) return
  pending.delete(source)
  settle(job, value)
}

function loadHidden() {
  if (hidden) return hidden
  hidden = new Set(readHidden())
  return hidden
}

function persistHidden() {
  if (!hidden) return
  writeHidden([...hidden])
}

export function listHidden() {
  return [...loadHidden()].sort((left, right) => left.localeCompare(right, 'en', { sensitivity: 'base' }))
}

export function isCopyHidden(text: string) {
  const source = text.trim()
  if (!source) return false
  return loadHidden().has(source)
}

export function hideCopy(text: string) {
  const source = text.trim()
  if (!source) return
  const store = loadHidden()
  if (store.has(source)) return
  store.add(source)
  persistHidden()
}

export function showCopy(text: string) {
  const source = text.trim()
  if (!source) return
  const store = loadHidden()
  if (!store.delete(source)) return
  persistHidden()
}

export function invalidateTranslation(text: string) {
  const source = text.trim()
  if (!source) return
  showCopy(source)
  bump(source)
  explicit.set(source, null)
  filled.delete(source)
  memory.delete(source)
  delete loadDictionary()[source]
  persistDictionary()
}

function pageGlobal() {
  if (typeof unsafeWindow === 'undefined') return globalThis
  return unsafeWindow
}

function readApi(): TranslatorApi | null {
  const candidate = (pageGlobal() as { Translator?: TranslatorApi }).Translator
  if (!candidate || typeof candidate.create !== 'function') return null
  return candidate
}

function fractionOf(event: DownloadProgressEvent) {
  const loaded = event.loaded ?? 0
  const total = event.total ?? 0
  if (total > 0) return Math.max(0, Math.min(1, loaded / total))
  if (loaded >= 0 && loaded <= 1) return loaded
  return 0
}

function settle(job: Job, value: string) {
  for (const resolve of job.resolvers) resolve(value)
}

function pump() {
  if (active > 0 || !engine || pending.size === 0) return
  let best: Job | null = null
  for (const job of pending.values()) {
    if (!best || job.priority > best.priority) best = job
  }
  if (!best) return
  const job = best
  pending.delete(job.text)
  const stored = cachedTranslation(job.text)
  if (stored) {
    settle(job, stored)
    pump()
    return
  }
  active = 1
  const stamp = rev(job.text)
  engine.translate(job.text).then((out) => {
    const clean = typeof out === 'string' && out.trim() ? out.trim() : job.text
    const kept = cachedTranslation(job.text)
    if (rev(job.text) !== stamp) {
      settle(job, kept ?? job.text)
      return
    }
    if (kept) {
      settle(job, kept)
      return
    }
    settle(job, fillTranslation(job.text, clean))
  }).catch(() => {
    settle(job, cachedTranslation(job.text) ?? job.text)
  }).finally(() => {
    active = 0
    pump()
  })
}

function kick() {
  if (scheduled) return
  scheduled = true
  queueMicrotask(() => {
    scheduled = false
    pump()
  })
}

const session: TranslationSession = {
  translate: (text, priority = 0) => {
    const trimmed = text.trim()
    if (!trimmed) return Promise.resolve(text)
    const cached = cachedTranslation(trimmed)
    if (cached) return Promise.resolve(cached)
    const existing = pending.get(trimmed)
    if (existing) {
      existing.priority = Math.max(existing.priority, priority)
      return new Promise((resolve) => {
        existing.resolvers.push(resolve)
      })
    }
    return new Promise((resolve) => {
      pending.set(trimmed, { text: trimmed, priority, resolvers: [resolve] })
      kick()
    })
  },
  prioritize: (texts) => {
    texts.forEach((text, index) => {
      const job = pending.get(text.trim())
      if (job) job.priority = Math.max(job.priority, 10_000 - index)
    })
  },
}

export async function translatorAvailability() {
  const api = readApi()
  if (!api) return 'missing'
  if (!api.availability) return 'ready'
  try {
    const value = await api.availability({ sourceLanguage: SOURCE, targetLanguage: TARGET })
    if (value === 'available') return 'ready'
    if (value === 'downloadable' || value === 'downloading') return 'download'
    return 'missing'
  } catch {
    return 'ready'
  }
}

export function beginTranslation(onProgress: (loaded: number) => void) {
  progressListener = onProgress
  if (sessionPromise) return sessionPromise

  const api = readApi()
  if (!api) {
    sessionPromise = Promise.resolve(null)
    return sessionPromise
  }

  let created: Promise<TranslatorEngine>
  try {
    created = api.create({
      sourceLanguage: SOURCE,
      targetLanguage: TARGET,
      monitor: (monitor) => {
        monitor.addEventListener('downloadprogress', (event) => {
          progressListener(fractionOf(event))
        })
      },
    })
  } catch {
    sessionPromise = Promise.resolve(null)
    return sessionPromise
  }

  sessionPromise = created.then((next) => {
    engine = next
    kick()
    return session
  }).catch(() => {
    sessionPromise = null
    return null
  })

  return sessionPromise
}

function notifyWatchers() {
  for (const listener of watchers) listener()
}

export function watchTranslations(listener: () => void) {
  watchers.add(listener)
  return () => {
    watchers.delete(listener)
  }
}

function adoptDictionary(incoming: Record<string, string>) {
  const previous = dictionary ?? {}
  const affected = new Set<string>()
  for (const key of new Set([...Object.keys(previous), ...Object.keys(incoming)])) {
    if (previous[key] !== incoming[key]) affected.add(key)
  }
  for (const key of affected) {
    bump(key)
    explicit.delete(key)
    filled.delete(key)
    const job = pending.get(key)
    if (!job) continue
    pending.delete(key)
    settle(job, incoming[key] ?? key)
  }
  remember({ ...incoming })
}

function adoptHidden(values: readonly string[]) {
  hidden = new Set(values)
}

subscribeStore((event) => {
  if (event.kind === 'dictionary') adoptDictionary(event.value)
  else adoptHidden(event.value)
  notifyWatchers()
})
