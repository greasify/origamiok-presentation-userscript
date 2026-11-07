import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { Buffer } from 'node:buffer'
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { extname, join, resolve, sep } from 'node:path'
import { parseDeck } from './deck.ts'
import { parseLibraries, safeSegments } from './files.ts'

const DECK_ID = /^[a-z0-9-]+$/
const BODY_LIMIT = 2_000_000
const IMAGE_TYPES: Record<string, string> = {
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
}
const LIBRARY_TITLE: Record<string, string> = {
  'best-origami-paper': 'Лучшая бумага',
  'learn-to-origami': 'Обучение',
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

function readJson(file: string) {
  return JSON.parse(readFileSync(file, 'utf8')) as unknown
}

async function readBody(req: IncomingMessage) {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk)
    size += buffer.length
    if (size > BODY_LIMIT) return null
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function listDecks(dir: string) {
  if (!existsSync(dir)) return []
  const found = []
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json')) continue
    const id = name.slice(0, -'.json'.length)
    if (!DECK_ID.test(id)) continue
    try {
      const deck = parseDeck(readJson(join(dir, name)))
      if (!deck || deck.id !== id) continue
      found.push({ id: deck.id, title: deck.title })
    } catch {
      // A broken draft stays out of the list until it parses again.
    }
  }
  return found.sort((a, b) => a.id.localeCompare(b.id))
}

function libraryFile(root: string, parts: string[]) {
  try {
    const base = realpathSync(root)
    const target = resolve(base, ...parts)
    if (target !== base && !target.startsWith(base + sep)) return null
    if (!existsSync(target) || !statSync(target).isFile()) return null
    const file = realpathSync(target)
    if (file !== base && !file.startsWith(base + sep)) return null
    return file
  } catch {
    return null
  }
}

function listImages(root: string) {
  const dir = join(root, 'images')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(name => IMAGE_TYPES[extname(name).toLowerCase()])
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
}

function libraryPayload(libraries: Record<string, string>) {
  return Object.entries(libraries).map(([id, root]) => ({
    id,
    title: LIBRARY_TITLE[id] ?? id,
    images: listImages(root).map(name => ({
      name,
      src: `/studio/sources/${id}/images/${encodeURIComponent(name)}`,
    })),
  }))
}

function loadLibraries(file: string) {
  try {
    return parseLibraries(readJson(file))
  } catch {
    return {}
  }
}

export function studioHub(): Plugin {
  return {
    name: 'studio-hub',
    apply: 'serve',
    configureServer(server) {
      const root = server.config.root
      const decksDir = resolve(root, 'studio/decks')
      mkdirSync(decksDir, { recursive: true })
      const libraries = () => loadLibraries(resolve(root, 'studio/libraries.json'))

      server.middlewares.use((req, res, next) => {
        void route(req, res, next).catch(error => next(error))
      })

      async function route(req: IncomingMessage, res: ServerResponse, next: (error?: unknown) => void) {
        const pathname = new URL(req.url ?? '/', 'http://studio.local').pathname
        if (!pathname.startsWith('/studio/')) {
          next()
          return
        }
        if (pathname === '/studio/api/decks' && req.method === 'GET') {
          sendJson(res, 200, listDecks(decksDir))
          return
        }
        if (pathname === '/studio/api/library' && req.method === 'GET') {
          sendJson(res, 200, libraryPayload(libraries()))
          return
        }
        const deckMatch = pathname.match(/^\/studio\/api\/decks\/([a-z0-9-]+)$/)
        if (deckMatch) {
          const id = deckMatch[1] ?? ''
          const file = join(decksDir, `${id}.json`)
          if (req.method === 'GET') {
            if (!existsSync(file)) {
              sendJson(res, 404, { error: 'Нет такой презентации' })
              return
            }
            try {
              const deck = parseDeck(readJson(file))
              if (!deck || deck.id !== id) {
                sendJson(res, 400, { error: 'Презентация не читается' })
                return
              }
              sendJson(res, 200, deck)
            } catch {
              sendJson(res, 400, { error: 'Презентация не читается' })
            }
            return
          }
          if (req.method === 'PUT') {
            const raw = await readBody(req)
            if (raw == null) {
              sendJson(res, 413, { error: 'Слишком большой файл' })
              return
            }
            let parsed: unknown
            try {
              parsed = JSON.parse(raw) as unknown
            } catch {
              sendJson(res, 400, { error: 'Это не JSON' })
              return
            }
            const deck = parseDeck(parsed)
            if (!deck || deck.id !== id) {
              sendJson(res, 400, { error: 'Презентация не сходится' })
              return
            }
            writeFileSync(file, `${JSON.stringify(deck, null, 2)}\n`)
            sendJson(res, 200, deck)
            return
          }
          sendJson(res, 405, { error: 'Метод не поддерживается' })
          return
        }
        const sourceMatch = pathname.match(/^\/studio\/sources\/([a-z0-9-]+)\/(.+)$/)
        if (sourceMatch && req.method === 'GET') {
          const slug = sourceMatch[1] ?? ''
          const rel = sourceMatch[2] ?? ''
          const folder = libraries()[slug]
          const parts = folder ? safeSegments(rel) : null
          const file = folder && parts ? libraryFile(folder, parts) : null
          const type = file ? IMAGE_TYPES[extname(file).toLowerCase()] : ''
          if (!file || !type) {
            sendJson(res, 404, { error: 'Нет такого снимка' })
            return
          }
          const info = statSync(file)
          res.statusCode = 200
          res.setHeader('content-type', type)
          res.setHeader('content-length', info.size)
          res.setHeader('cache-control', 'no-cache')
          createReadStream(file).pipe(res)
          return
        }
        sendJson(res, 404, { error: 'Нет такого адреса' })
      }
    },
  }
}
