const HOST_ID = 'origami-presentation-host'

let boundKey: ((event: KeyboardEvent) => void) | null = null
let boundFullscreen: (() => void) | null = null
let heldOverflow: string | null = null
let releaseSync: (() => void) | null = null

export function bindRelease(release: () => void) {
  releaseSync?.()
  releaseSync = release
}

function pageKeyboard() {
  return (navigator as Navigator & {
    keyboard?: {
      lock?: (keyCodes?: string[]) => Promise<void>
      unlock?: () => void
    }
  }).keyboard
}

function dropBoundListeners() {
  if (boundKey) {
    window.removeEventListener('keydown', boundKey, true)
    boundKey = null
  }
  if (boundFullscreen) {
    document.removeEventListener('fullscreenchange', boundFullscreen)
    boundFullscreen = null
  }
}

export function releaseOverflow() {
  if (heldOverflow === null) return
  document.documentElement.style.overflow = heldOverflow
  heldOverflow = null
}

export function holdOverflow() {
  if (heldOverflow === null) heldOverflow = document.documentElement.style.overflow
  document.documentElement.style.overflow = 'hidden'
}

export function lockEscape() {
  const keyboard = pageKeyboard()
  if (!keyboard?.lock) return
  keyboard.lock(['Escape']).catch(() => {})
}

export function unlockEscape() {
  pageKeyboard()?.unlock?.()
}

export function bindKey(handler: (event: KeyboardEvent) => void) {
  window.addEventListener('keydown', handler, true)
  boundKey = handler
}

export function unbindKey(handler: (event: KeyboardEvent) => void) {
  window.removeEventListener('keydown', handler, true)
  if (boundKey === handler) boundKey = null
}

export function bindFullscreen(handler: () => void) {
  document.addEventListener('fullscreenchange', handler)
  boundFullscreen = handler
}

export function unmountPresentation() {
  releaseSync?.()
  releaseSync = null
  releaseOverflow()
  dropBoundListeners()
  unlockEscape()
  const host = document.getElementById(HOST_ID)
  if (host && document.fullscreenElement === host) document.exitFullscreen()
  host?.remove()
}

export { HOST_ID }
