import type {
  KnownBlock,
  RichTextBlock,
  RichTextBlockElement,
  RichTextElement,
} from '@slack/types'

export function replaceInBlocks(
  blocks: KnownBlock[],
  search: string,
  replace: string
) {
  for (const block of blocks) {
    switch (block.type) {
      case 'context':
        block.elements.forEach((element) => {
          if (element.type === 'mrkdwn' || element.type === 'plain_text') {
            element.text = element.text.replaceAll(search, replace)
          }
        })
        break
      case 'header':
        block.text.text = block.text.text.replaceAll(search, replace)
        break
      case 'markdown':
        block.text = block.text.replaceAll(search, replace)
        break
      case 'rich_text':
        replaceInRichText(block, search, replace)
        break
      case 'section':
        if (block.text) {
          block.text.text = block.text.text.replaceAll(search, replace)
        }
        break
      case 'table':
        block.rows.flat().forEach((element) => {
          if (element.type === 'raw_text') {
            element.text = element.text.replaceAll(search, replace)
          } else {
            replaceInRichText(element, search, replace)
          }
        })
        break
    }
  }
}

export function replaceInRichText(
  block: RichTextBlock,
  search: string,
  replace: string
) {
  block.elements.forEach((element) =>
    replaceInRichTextBlockElement(element, search, replace)
  )
}

function replaceInRichTextBlockElement(
  element: RichTextBlockElement,
  search: string,
  replace: string
) {
  switch (element.type) {
    case 'rich_text_list':
      element.elements.forEach((section) =>
        replaceInRichTextBlockElement(section, search, replace)
      )
      break
    case 'rich_text_preformatted':
    case 'rich_text_quote':
    case 'rich_text_section':
      element.elements.forEach((element) =>
        replaceInRichTextElement(element, search, replace)
      )
      break
  }
}
function replaceInRichTextElement(
  element: RichTextElement,
  search: string,
  replace: string
) {
  switch (element.type) {
    case 'emoji':
      element.name = element.name.replaceAll(search, replace)
      break
    case 'color':
      element.value = element.value.replaceAll(search, replace)
      break
    case 'link':
      if (element.text) {
        element.text = element.text.replaceAll(search, replace)
      }
      break
    case 'text':
      element.text = element.text.replaceAll(search, replace)
      break
  }
}
