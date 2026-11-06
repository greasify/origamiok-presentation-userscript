import type { Plugin, ViteDevServer, WebSocketClient } from 'vite'
import type { HubMessage } from './protocol.ts'
import {
  mkdirSync,
  readFileSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { networkInterfaces } from 'node:os'
import { basename, resolve } from 'node:path'
import { generate } from 'selfsigned'
import {
  mergeStoredState,
  needsMarkup,
  parseHubMessage,
} from './protocol.ts'

const VIRTUAL = 'virtual:presenter-hub'
const RESOLVED = `\0${VIRTUAL}`

interface HubFile {
  presenterUrl: string
  socketUrl: string
}

function pathnameOf(url: string | undefined) {
  return (url ?? '').split('?')[0]
}

function lanIPv4() {
  const found: string[] = []
  for (const nets of Object.values(networkInterfaces())) {
    for (const net of nets ?? []) {
      const family = String(net.family)
      if ((family === 'IPv4' || family === '4') && !net.internal) found.push(net.address)
    }
  }
  return found
}

function readHub(file: string): HubFile {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as unknown
    if (!parsed || typeof parsed !== 'object') return { presenterUrl: '', socketUrl: '' }
    const record = parsed as Record<string, unknown>
    return {
      presenterUrl: typeof record.presenterUrl === 'string' ? record.presenterUrl : '',
      socketUrl: typeof record.socketUrl === 'string' ? record.socketUrl : '',
    }
  } catch {
    return { presenterUrl: '', socketUrl: '' }
  }
}

function moduleSource(file: string) {
  const hub = readHub(file)
  return `export const presenterUrl = ${JSON.stringify(hub.presenterUrl)}
export const socketUrl = ${JSON.stringify(hub.socketUrl)}
`
}

function createRoom(sockets: ViteDevServer['ws']) {
  const roles = new WeakMap<WebSocketClient, 'stage' | 'remote'>()
  const primed = new WeakSet<WebSocketClient>()
  let lastState: string | null = null
  let awaitingSync = false

  const send = (client: WebSocketClient, message: HubMessage) => {
    client.send('presenter', message)
  }

  const storedState = () => {
    const parsed = lastState ? parseHubMessage(lastState) : null
    return parsed?.type === 'state' ? parsed.state : null
  }

  const askStages = () => {
    if (awaitingSync) return
    let asked = false
    for (const client of sockets.clients) {
      if (roles.get(client) !== 'stage') continue
      send(client, { type: 'sync' })
      asked = true
    }
    if (asked) awaitingSync = true
  }

  const deliver = (client: WebSocketClient, fresh: HubMessage) => {
    if (roles.get(client) !== 'remote') return
    const stored = storedState()
    if (!primed.has(client) && stored && !needsMarkup(stored) && lastState) {
      const snapshot = parseHubMessage(lastState)
      if (!snapshot) return
      send(client, snapshot)
      primed.add(client)
      return
    }
    if (primed.has(client)) send(client, fresh)
  }

  sockets.on('presenter', (data, client) => {
    const message = parseHubMessage(JSON.stringify(data))
    if (!message) return
    if (message.type === 'hello') {
      roles.set(client, message.role)
      if (message.role !== 'remote') return
      const stored = storedState()
      if (stored && !needsMarkup(stored) && lastState) {
        const snapshot = parseHubMessage(lastState)
        if (snapshot) {
          send(client, snapshot)
          primed.add(client)
        }
        return
      }
      askStages()
      return
    }
    if (message.type === 'state' && roles.get(client) === 'stage') {
      const previous = storedState()
      const keyChanged = previous !== null && previous.key !== message.state.key
      lastState = mergeStoredState(lastState, message)
      if (keyChanged) {
        awaitingSync = false
        for (const other of sockets.clients) {
          if (roles.get(other) === 'remote') primed.delete(other)
        }
      }
      const stored = storedState()
      if (stored && !needsMarkup(stored)) awaitingSync = false
      else askStages()
      for (const other of sockets.clients) deliver(other, message)
      return
    }
    if (message.type === 'command' && roles.get(client) === 'remote') {
      for (const other of sockets.clients) {
        if (roles.get(other) === 'stage') send(other, message)
      }
    }
  })

  sockets.on('vite:client:disconnect', (_data, client) => {
    roles.delete(client)
    primed.delete(client)
  })
}

async function certificate(dir: string, ips: string[]) {
  const metaPath = resolve(dir, 'meta.json')
  const keyPath = resolve(dir, 'key.pem')
  const certPath = resolve(dir, 'cert.pem')
  const mark = ips.join(',')
  try {
    const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as { ips?: string }
    if (meta.ips === mark) {
      return { key: readFileSync(keyPath, 'utf8'), cert: readFileSync(certPath, 'utf8') }
    }
  } catch {
    // A new address needs a certificate that names it.
  }
  const notAfter = new Date()
  notAfter.setFullYear(notAfter.getFullYear() + 1)
  const pems = await generate([{ name: 'commonName', value: 'origami-presenter' }], {
    algorithm: 'sha256',
    keySize: 2048,
    notAfterDate: notAfter,
    extensions: [
      { name: 'basicConstraints', cA: false },
      { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
      { name: 'extKeyUsage', serverAuth: true },
      {
        name: 'subjectAltName',
        altNames: [
          { type: 2, value: 'localhost' },
          { type: 7, ip: '127.0.0.1' },
          ...ips.map(ip => ({ type: 7 as const, ip })),
        ],
      },
    ],
  })
  mkdirSync(dir, { recursive: true })
  writeFileSync(keyPath, pems.private)
  writeFileSync(certPath, pems.cert)
  writeFileSync(metaPath, JSON.stringify({ ips: mark }))
  return { key: pems.private, cert: pems.cert }
}

function publishHub(server: ViteDevServer, port: number) {
  const host = lanIPv4()[0] ?? 'localhost'
  const presenterUrl = `https://${host}:${port}/presenter`
  const socketUrl = `wss://${host}:${port}/?token=${server.config.webSocketToken}`
  const hubFile = resolve(server.config.root, 'src/presenter/.hub.json')
  const next: HubFile = { presenterUrl, socketUrl }
  const previous = readHub(hubFile)
  if (previous.presenterUrl !== next.presenterUrl || previous.socketUrl !== next.socketUrl) {
    mkdirSync(resolve(hubFile, '..'), { recursive: true })
    writeFileSync(hubFile, `${JSON.stringify(next, null, 2)}\n`)
    const stamp = resolve(server.config.root, 'src/presentation/sync.ts')
    const now = new Date()
    try {
      utimesSync(stamp, now, now)
    } catch {
      // The deck client is touched so the dev userscript picks up the socket address.
    }
  }
}

export function presenterHub(): Plugin {
  let root = process.cwd()
  const hubFile = () => resolve(root, 'src/presenter/.hub.json')

  return {
    name: 'presenter-hub',
    async config() {
      const { key, cert } = await certificate(resolve(root, 'node_modules/.cache/origami-presenter'), lanIPv4())
      return {
        server: {
          https: { key, cert },
        },
      }
    },
    configResolved(config) {
      root = config.root
    },
    resolveId(id) {
      if (id === VIRTUAL) return RESOLVED
    },
    load(id) {
      if (id === RESOLVED) return moduleSource(hubFile())
    },
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (basename(ctx.filename ?? '') !== 'presenter.html') return
        return html.replace(/^[ \t]*<script type="module" src="\/@vite\/client"><\/script>\r?\n?/m, '')
      },
    },
    configureServer(server) {
      createRoom(server.ws)
      server.middlewares.use((req, _res, next) => {
        const path = pathnameOf(req.url)
        if (path === '/presenter' || path === '/presenter/') req.url = '/presenter.html'
        next()
      })
      server.httpServer?.once('listening', () => {
        const address = server.httpServer?.address()
        if (!address || typeof address === 'string') return
        publishHub(server, address.port)
      })
    },
  }
}
