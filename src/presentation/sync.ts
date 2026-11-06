import type { RemoteCommand, RemoteState } from '../presenter/protocol'
import { presenterUrl, socketUrl } from 'virtual:presenter-hub'
import { blankRepeatedMarkup, decodePresenterFrame, encodePresenterFrame, PRESENTER_SOCKET_PROTOCOL } from '../presenter/protocol'
import { bindRelease } from './host'

export function presenterHref() {
  const base = location.protocol === 'https:' && presenterUrl
    ? presenterUrl
    : `${location.origin}/presenter`
  return new URL(base, location.href).href
}

export function attachStage(options: {
  key: string
  read: () => RemoteState
  apply: (command: RemoteCommand) => void
}) {
  let stopped = false
  let applying = false
  let socket: WebSocket | null = null
  let timer = 0
  let queued = false
  let sentMarkup: string[] = []

  const endpoint = () => socketUrl

  const sendState = () => {
    if (stopped || applying || socket?.readyState !== WebSocket.OPEN) return
    const state = options.read()
    const slides = blankRepeatedMarkup(sentMarkup, state.slides)
    sentMarkup = state.slides.map(slide => slide.markup)
    socket.send(encodePresenterFrame({ type: 'state', state: { ...state, slides } }))
  }

  const publish = () => {
    if (stopped || applying || queued) return
    queued = true
    queueMicrotask(() => {
      queued = false
      sendState()
    })
  }

  const connect = () => {
    if (stopped) return
    const url = endpoint()
    if (!url) {
      timer = window.setTimeout(connect, 1000)
      return
    }
    const ws = new WebSocket(url, PRESENTER_SOCKET_PROTOCOL)
    socket = ws
    ws.addEventListener('open', () => {
      sentMarkup = []
      ws.send(encodePresenterFrame({ type: 'hello', role: 'stage' }))
      publish()
    })
    ws.addEventListener('message', (event) => {
      const message = decodePresenterFrame(String(event.data))
      if (!message) return
      if (message.type === 'sync') {
        sentMarkup = []
        publish()
        return
      }
      if (message.type !== 'command' || message.command.key !== options.key) return
      applying = true
      try {
        options.apply(message.command)
      } finally {
        applying = false
      }
      publish()
    })
    ws.addEventListener('close', () => {
      if (socket !== ws || stopped) return
      timer = window.setTimeout(connect, 1000)
    })
  }

  const stop = () => {
    if (stopped) return
    stopped = true
    window.clearTimeout(timer)
    socket?.close()
    socket = null
  }

  bindRelease(stop)
  connect()
  return { publish, stop }
}
