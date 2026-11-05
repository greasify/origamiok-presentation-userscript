const TITLE_FIRST = ['with easy instructions']

const TITLE_WORDS = ['origami', 'instructions']

const TITLE_PHRASES = [
  'how to fold an easy',
  'how to make an easy',
  'how to fold an',
  'how to fold a',
  'how to make an',
  'how to make a',
  'how to fold',
  'how to make',
  'step-by-step',
  'step by step',
  'with pictures',
  'for beginners',
]

function cutPhrases(title: string, phrases: readonly string[]) {
  let name = title
  for (const phrase of phrases) {
    name = name.replace(new RegExp(String.raw`\b${phrase}\b`, 'gi'), ' ')
  }
  return name.replace(/\s+/g, ' ').replace(/^[\s:;,\-–—|]+|[\s:;,\-–—|]+$/g, '').trim()
}

function cutTitleWords(title: string) {
  let name = title
  for (const word of TITLE_WORDS) {
    name = name.replace(new RegExp(String.raw`\b${word}\b`, 'gi'), ' ')
  }
  return name.replace(/\s+/g, ' ').trim()
}

export function capitalLead(value: string) {
  const index = value.search(/\S/u)
  if (index < 0) return value
  const char = value[index] ?? ''
  return value.slice(0, index) + char.toLocaleUpperCase('ru') + value.slice(index + 1)
}

export function cleanModelTitle(title: string) {
  return capitalLead(cutPhrases(cutTitleWords(cutPhrases(title, TITLE_FIRST)), TITLE_PHRASES))
}

export function modelNameFrom(title: string) {
  const withoutSite = title.replace(/\s+[-|–—]\s*OrigamiOK\s*$/i, '').trim()
  const head = (withoutSite.split(/\s*:\s*/)[0] ?? '').trim()
  return capitalLead(cleanModelTitle(head) || head || withoutSite || title)
}
