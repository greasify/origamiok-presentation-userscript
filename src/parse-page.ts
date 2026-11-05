import type { PageModel } from './parse/types'
import { walkArticle } from './parse/article'
import { modelNameFrom } from './parse/title'

export { factLines, toolLines } from './parse/cover'

export type {
  Facts,
  PageModel,
  Photo,
  RelatedBlock,
  RelatedCard,
  SectionBlock,
  StepBlock,
} from './parse/types'

export function pageHasSlides(page: PageModel) {
  if (page.steps.length > 0) return true
  return page.sections.some(section => section.paragraphs.length > 0
    || section.images.length > 0
    || section.lists.some(list => list.length > 0),
  )
}

export function parsePage(doc: Document, content: Element): PageModel {
  const article = walkArticle(doc, content)
  return {
    sourceUrl: article.sourceUrl,
    modelName: modelNameFrom(article.rawTitle),
    authors: article.authors,
    facts: article.facts,
    youtubeId: article.youtubeId,
    hero: article.hero,
    steps: article.steps,
    sections: article.sections,
    related: article.related,
  }
}
