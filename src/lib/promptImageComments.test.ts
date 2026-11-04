import { describe, expect, it } from 'vitest'
import { getImageComments, getImageCommentToken, getPromptCommentParts, getPromptIndexFromVisibleIndex, getTaskPromptText, remapImageCommentsForOrder, stripPromptCommentData, upsertImageComment } from './promptImageComments'

const images = [
  { id: 'image-a', dataUrl: 'data:image/png;base64,a' },
  { id: 'image-b', dataUrl: 'data:image/png;base64,b' },
]
const comments = [{ x: 0.52, y: 0.41, text: '改成红色 "引号"' }, { x: 0.1, y: 0.8, text: '删除' }]

describe('prompt image comments', () => {
  it('round-trips comments and hides the data segment from visible text', () => {
    const token = getImageCommentToken(1, comments)
    const prompt = `参考${token}调整`
    expect(getImageComments(prompt, 1)).toEqual(comments)
    expect(getImageComments(prompt, 0)).toEqual([])
    expect(stripPromptCommentData(prompt)).toBe('参考图2 评论调整')
    expect(prompt.slice(getPromptIndexFromVisibleIndex(prompt, 7))).toBe('调整')
    expect(getPromptCommentParts(prompt, images)).toEqual([
      { type: 'text', text: '参考' },
      { type: 'comment', text: '图2 评论', imageIndex: 1, rawText: token },
      { type: 'text', text: '调整' },
    ])
  })

  it('inserts comments before another capsule without breaking its data', () => {
    const token = getImageCommentToken(0, comments)
    for (const [cursor, before] of [[3, 'abc'], [0, '']] as const) {
      const prompt = `${before}${token} tail`
      expect(upsertImageComment(prompt, 1, comments, cursor).prompt).toBe(`${before}${getImageCommentToken(1, comments)}${token} tail`)
    }
  })

  it('replaces selected comments and returns the cursor after the new capsule', () => {
    const result = upsertImageComment(`前${getImageCommentToken(0, comments)}后`, 1, comments, 1, 6)
    expect(result.prompt).toBe(`前${getImageCommentToken(1, comments)}后`)
    expect(result.cursor).toBe(6)
    expect(upsertImageComment(result.prompt, 1, comments.slice(1), 0, 8).cursor).toBeNull()
  })

  it('inserts, replaces and removes comments', () => {
    const inserted = upsertImageComment('前后', 0, comments, 1).prompt
    expect(stripPromptCommentData(inserted)).toBe('前图1 评论后')
    const replaced = upsertImageComment(inserted, 0, comments.slice(1), 0).prompt
    expect(getImageComments(replaced, 0)).toEqual(comments.slice(1))
    expect(upsertImageComment(replaced, 0, [], 0)).toEqual({ prompt: '前后', cursor: null })
    expect(stripPromptCommentData(upsertImageComment('文本', 1, comments, Infinity).prompt)).toBe('文本图2 评论')
  })

  it('follows image reordering and disappears with the removed image', () => {
    const prompt = getImageCommentToken(0, comments)
    expect(getImageComments(remapImageCommentsForOrder(prompt, images, [images[1], images[0]]), 1)).toEqual(comments)
    expect(remapImageCommentsForOrder(prompt, images, [images[1]])).toBe('')
  })

  it('expands comments into coordinate lines separated by blank lines', () => {
    const prompt = `把背景换掉${getImageCommentToken(0, comments)}${getImageCommentToken(1, [comments[1]])} 整体偏暖色调`
    expect(getTaskPromptText(prompt)).toBe([
      '把背景换掉',
      '',
      '[image 1] notes:',
      '1. (X=52%, Y=41%) 改成红色 "引号"',
      '2. (X=10%, Y=80%) 删除',
      '',
      '[image 2] notes:',
      '1. (X=10%, Y=80%) 删除',
      '',
      '整体偏暖色调',
    ].join('\n'))
    expect(getTaskPromptText(`前\n\n${getImageCommentToken(0, [comments[1]])}\n\n后`)).toBe('前\n\n[image 1] notes:\n1. (X=10%, Y=80%) 删除\n\n后')
  })

  it('keeps ordinary text including @ unchanged for display and API requests', () => {
    const prompt = '第一张图的人物，第二张图的画风，@图1，name@example.com'
    expect(getTaskPromptText(prompt)).toBe(prompt)
    expect(getPromptCommentParts(prompt, images)).toEqual([{ type: 'text', text: prompt }])
  })

  it('ignores malformed persisted comment data', () => {
    for (const data of ['%invalid', 'null', '{}', '[null,1,{"x":"bad","y":0,"text":"bad"}]']) {
      const prompt = `\u2063图1 评论\u2065${data}\u2064`
      expect(getImageComments(prompt, 0)).toEqual([])
      expect(getTaskPromptText(prompt)).toBe('')
    }
  })
})
