import { describe, expect, it } from 'vitest'
import { modelNameFrom } from './title'

describe('model name', () => {
  it.each([
    ['Origami Four-Leaf Clover with Easy Instructions', 'Four-Leaf Clover'],
    ['Origami Four-Leaf Clover with Easy Instructions - OrigamiOK', 'Four-Leaf Clover'],
    ['How to Make an Origami Combined Four Leaf Clover', 'Combined Four Leaf Clover'],
    ['How to Make an Origami Combined Four Leaf Clover - OrigamiOK', 'Combined Four Leaf Clover'],
    ['How to Fold an Easy Origami Pear', 'Pear'],
    ['How to Make an Origami Crown with 6 Pieces of Paper', 'Crown with 6 Pieces of Paper'],
    ['Origami Swan: Step-by-Step Instructions', 'Swan'],
    ['Origami Rabbit Face', 'Rabbit Face'],
    ['Origami Heart Box: Advanced 40-Step Guide', 'Heart Box'],
    ['origami swan', 'Swan'],
    ['origami four-leaf clover with easy instructions', 'Four-leaf clover'],
  ])('%s → %s', (title, name) => {
    expect(modelNameFrom(title)).toBe(name)
  })
})
