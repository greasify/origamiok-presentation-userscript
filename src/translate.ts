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
const STORE_KEY = 'origami-presentation:v1:en:ru'

const memory = new Map<string, string>()
const pending = new Map<string, Job>()
const revision = new Map<string, number>()
let dictionary: Record<string, string> | null = null
let active = 0
let scheduled = false
let engine: TranslatorEngine | null = null
let sessionPromise: Promise<TranslationSession | null> | null = null
let progressListener: (loaded: number) => void = () => {}

function persistDictionary() {
  if (!dictionary) return
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(dictionary))
  } catch {
    // Storage can be full or blocked. The memory map still covers this visit.
  }
}

function loadDictionary() {
  if (dictionary) return dictionary
  const store: Record<string, string> = {}
  try {
    const parsed = JSON.parse(localStorage.getItem(STORE_KEY) ?? '') as unknown
    if (parsed && typeof parsed === 'object') {
      for (const [src, out] of Object.entries(parsed)) {
        if (typeof out === 'string' && out.trim()) store[src] = out
      }
    }
  } catch {
    // A broken record is replaced on the next successful write.
  }
  dictionary = store
  return store
}

export function cachedTranslation(text: string) {
  const trimmed = text.trim()
  if (!trimmed) return null
  const hit = memory.get(trimmed) ?? loadDictionary()[trimmed]
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

function writeCache(text: string, translated: string) {
  memory.set(text, translated)
  loadDictionary()[text] = translated
  persistDictionary()
}

export function saveTranslation(text: string, translated: string) {
  const source = text.trim()
  const value = translated.trim()
  if (!source || !value) return
  bump(source)
  writeCache(source, value)
  const job = pending.get(source)
  if (!job) return
  pending.delete(source)
  settle(job, value)
}

export function invalidateTranslation(text: string) {
  const source = text.trim()
  if (!source) return
  bump(source)
  memory.delete(source)
  const store = loadDictionary()
  if (!(source in store)) return
  delete store[source]
  persistDictionary()
}

function readApi(): TranslatorApi | null {
  const candidate = (globalThis as { Translator?: TranslatorApi }).Translator
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
  active = 1
  const stamp = rev(job.text)
  engine.translate(job.text).then((out) => {
    const clean = typeof out === 'string' && out.trim() ? out.trim() : job.text
    if (rev(job.text) !== stamp) {
      settle(job, cachedTranslation(job.text) ?? clean)
      return
    }
    writeCache(job.text, clean)
    settle(job, clean)
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
