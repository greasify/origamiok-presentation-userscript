const LIBRARY_ID = /^[a-z0-9-]+$/

export function safeSegments(rel: string) {
  const parts: string[] = []
  for (const part of rel.split('/')) {
    if (!part || part === '.') continue
    let decoded = part
    try {
      decoded = decodeURIComponent(part)
    } catch {
      return null
    }
    if (!decoded || decoded === '..' || decoded.includes('/') || decoded.includes('\\') || decoded.includes('\0')) {
      return null
    }
    parts.push(decoded)
  }
  return parts
}

export function parseLibraries(value: unknown) {
  if (!value || typeof value !== 'object') return {}
  const libraries: Record<string, string> = {}
  for (const [key, root] of Object.entries(value)) {
    if (!LIBRARY_ID.test(key) || typeof root !== 'string' || !root.trim()) continue
    libraries[key] = root
  }
  return libraries
}
