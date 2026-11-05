export interface Photo {
  url: string
  alt: string
}

export interface Facts {
  minutes: number | null
  paper: string | null
  steps: number | null
  difficulty: string | null
}

export interface StepBlock {
  n: number
  paragraphs: string[]
  images: Photo[]
}

export interface SectionBlock {
  heading: string
  paragraphs: string[]
  lists: string[][]
  images: Photo[]
}

export interface RelatedCard {
  title: string
  href: string
  image: Photo | null
  meta: string[]
}

export interface RelatedBlock {
  heading: string
  items: RelatedCard[]
}

export interface PageModel {
  sourceUrl: string
  modelName: string
  authors: string[]
  facts: Facts
  youtubeId: string | null
  hero: Photo | null
  steps: StepBlock[]
  sections: SectionBlock[]
  related: RelatedBlock | null
}
