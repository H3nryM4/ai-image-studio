import type { ImageComment, InputImage } from '../types'

const COMMENT_START = '\u2063'
const COMMENT_END = '\u2064'
// 评论数据隐藏在胶囊内，不参与显示和光标计算
const COMMENT_DATA_START = '\u2065'
const IMAGE_COMMENT_RE = /\u2063图(\d+) 评论\u2065([^\u2064]*)\u2064/g

export function stripPromptCommentData(prompt: string): string {
  return prompt.replace(/\u2065[^\u2064]*/g, '').replace(/[\u2063\u2064]/g, '')
}

export function getPromptIndexFromVisibleIndex(prompt: string, visibleIndex: number): number {
  let visible = 0
  for (let i = 0; i < prompt.length; i++) {
    if (prompt[i] === COMMENT_DATA_START) {
      while (i + 1 < prompt.length && prompt[i + 1] !== COMMENT_END) i++
      continue
    }
    if (prompt[i] === COMMENT_END) continue
    // 恰好位于胶囊开头时返回起始标记之前，避免把内容插进胶囊内部
    if (visible >= visibleIndex) return i
    if (prompt[i] === COMMENT_START) continue
    visible++
  }
  return prompt.length
}

export function remapImageCommentsForOrder(
  prompt: string,
  previousImages: InputImage[],
  nextImages: InputImage[],
  equivalentImageIds: Record<string, string> = {},
): string {
  return prompt.replace(IMAGE_COMMENT_RE, (text, n, data) => {
    const previousImage = previousImages[Number(n) - 1]
    if (!previousImage) return text
    const nextImageId = equivalentImageIds[previousImage.id] ?? previousImage.id
    const idx = nextImages.findIndex((img) => img.id === nextImageId)
    // 图片被移除时评论随之失效
    return idx >= 0 ? `${COMMENT_START}图${idx + 1} 评论${COMMENT_DATA_START}${data}${COMMENT_END}` : ''
  })
}

export type PromptCommentPart =
  | { type: 'text'; text: string }
  | { type: 'comment'; text: string; imageIndex: number; rawText: string }

export function getPromptCommentParts(prompt: string, inputImages: InputImage[]): PromptCommentPart[] {
  const parts: PromptCommentPart[] = []
  let lastIndex = 0

  for (const match of prompt.matchAll(IMAGE_COMMENT_RE)) {
    const idx = Number(match[1]) - 1
    if (!inputImages[idx]) continue
    if (match.index > lastIndex) {
      parts.push({ type: 'text', text: stripPromptCommentData(prompt.slice(lastIndex, match.index)) })
    }
    parts.push({ type: 'comment', text: `图${idx + 1} 评论`, imageIndex: idx, rawText: match[0] })
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < prompt.length) {
    parts.push({ type: 'text', text: stripPromptCommentData(prompt.slice(lastIndex)) })
  }
  return parts.length > 0 ? parts : [{ type: 'text', text: stripPromptCommentData(prompt) }]
}

function parseImageComments(data: string): ImageComment[] {
  try {
    const value: unknown = JSON.parse(decodeURIComponent(data))
    if (!Array.isArray(value)) return []
    // 数据来自持久化的提示词，逐项校验
    return value.flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const comment = item as Record<string, unknown>
      if (typeof comment.x !== 'number' || typeof comment.y !== 'number' || typeof comment.text !== 'string') return []
      return [{ x: Math.min(1, Math.max(0, comment.x)), y: Math.min(1, Math.max(0, comment.y)), text: comment.text }]
    })
  } catch {
    return []
  }
}

/** 评论胶囊显示为“图N 评论”，评论数据经 URI 编码附在隐藏数据段中。 */
export function getImageCommentToken(index: number, comments: ImageComment[]) {
  const data = comments.map((comment) => ({
    x: Math.round(comment.x * 10000) / 10000,
    y: Math.round(comment.y * 10000) / 10000,
    text: comment.text.replace(/[\u2063-\u2065]/g, ''),
  }))
  return `${COMMENT_START}图${index + 1} 评论${COMMENT_DATA_START}${encodeURIComponent(JSON.stringify(data))}${COMMENT_END}`
}

export function getImageComments(prompt: string, index: number): ImageComment[] {
  for (const match of prompt.matchAll(IMAGE_COMMENT_RE)) {
    if (Number(match[1]) - 1 === index) return parseImageComments(match[2])
  }
  return []
}

/** 已有评论原地更新，新增评论覆盖可见选区，评论为空时移除胶囊。 */
export function upsertImageComment(prompt: string, index: number, comments: ImageComment[], visibleStart: number, visibleEnd = visibleStart) {
  let found = false
  const next = prompt.replace(IMAGE_COMMENT_RE, (text, n) => {
    if (Number(n) - 1 !== index || found) return text
    found = true
    return comments.length ? getImageCommentToken(index, comments) : ''
  })
  if (found || !comments.length) return { prompt: next, cursor: null }
  const start = getPromptIndexFromVisibleIndex(prompt, visibleStart)
  const end = getPromptIndexFromVisibleIndex(prompt, visibleEnd)
  const token = getImageCommentToken(index, comments)
  return {
    prompt: `${prompt.slice(0, start)}${token}${prompt.slice(end)}`,
    cursor: stripPromptCommentData(prompt.slice(0, start) + token).length,
  }
}

/** 任务保留评论数据以便复用，发送请求和展示时展开为坐标与评论列表。 */
export function getTaskPromptText(prompt: string) {
  // 评论段与普通文字及其他图片的评论之间都空一行
  const ensureBlankLine = (text: string, trailing: boolean) => {
    const newlines = (trailing ? /\n*$/ : /^\n*/).exec(text)![0].length
    return '\n'.repeat(Math.max(0, 2 - newlines))
  }
  let result = ''
  let lastIndex = 0
  let afterBlock = false
  const appendText = (text: string) => {
    const trimmed = afterBlock ? text.replace(/^[ \t]+/, '') : text
    if (!trimmed) return
    if (afterBlock) result += ensureBlankLine(trimmed, false)
    afterBlock = false
    result += trimmed
  }
  for (const match of prompt.matchAll(IMAGE_COMMENT_RE)) {
    appendText(prompt.slice(lastIndex, match.index))
    lastIndex = match.index + match[0].length
    const comments = parseImageComments(match[2])
    if (!comments.length) continue
    const percent = (value: number) => `${Math.round(value * 100)}%`
    const lines = comments.map((comment, idx) => `${idx + 1}. (X=${percent(comment.x)}, Y=${percent(comment.y)}) ${comment.text}`)
    result = result.replace(/[ \t]+$/, '')
    if (result) result += ensureBlankLine(result, true)
    result += `[image ${match[1]}] notes:\n${lines.join('\n')}`
    afterBlock = true
  }
  appendText(prompt.slice(lastIndex))
  return stripPromptCommentData(result)
}
