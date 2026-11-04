// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import { getCommentTagHtml, getContentEditablePlainText, getContentEditableSelection, setContentEditableCursor, syncCommentTagSelection } from './contentEditableComments'
import { getImageCommentToken } from './promptImageComments'

describe('contentEditable comments', () => {
  beforeEach(() => {
    document.body.replaceChildren()
    window.getSelection()?.removeAllRanges()
  })

  it('escapes the visible label and raw data in comment HTML', () => {
    expect(getCommentTagHtml('图1 评论<&">', 'data<&">')).toBe(
      '<span contenteditable="false" class="comment-tag" data-comment-text="data&lt;&amp;&quot;&gt;">图1 评论&lt;&amp;&quot;&gt;</span>',
    )
  })

  it('round-trips cursor offsets around a comment', () => {
    const el = document.createElement('div')
    el.contentEditable = 'true'
    el.innerHTML = '前<span contenteditable="false" class="comment-tag">图1 评论</span>后'
    document.body.append(el)

    for (const offset of [0, 1, 6, 7]) {
      setContentEditableCursor(el, offset)
      expect(getContentEditableSelection(el)).toEqual({ start: offset, end: offset })
    }
  })

  it('expands a selection inside a comment to the whole capsule', () => {
    const el = document.createElement('div')
    el.contentEditable = 'true'
    el.innerHTML = '前<span contenteditable="false" class="comment-tag">图1 评论</span>后'
    document.body.append(el)
    const text = el.querySelector('span')!.firstChild!
    const range = document.createRange()
    range.setStart(text, 1)
    range.setEnd(text, 3)
    window.getSelection()!.addRange(range)

    expect(getContentEditableSelection(el)).toEqual({ start: 1, end: 6 })
  })

  it('clamps Ctrl+A boundaries outside the editor', () => {
    document.body.innerHTML = '<p>前置</p><div contenteditable="true">正文</div><p>后置</p>'
    const el = document.querySelector<HTMLElement>('[contenteditable]')!
    const before = document.body.firstElementChild!.firstChild!
    const after = document.body.lastElementChild!.firstChild!
    const range = document.createRange()
    range.setStart(before, 0)
    range.setEnd(after, after.textContent!.length)
    window.getSelection()!.addRange(range)

    expect(getContentEditableSelection(el)).toEqual({ start: 0, end: 2 })
  })

  it('round-trips hidden comment data through the editor', () => {
    const el = document.createElement('div')
    const raw = getImageCommentToken(0, [{ x: 0.5, y: 0.5, text: '修改 "颜色" <&>' }])
    el.innerHTML = `前${getCommentTagHtml('图1 评论', raw)}后`

    expect(getContentEditablePlainText(el)).toBe(`前${raw}后`)
  })

  it('marks only comments intersecting the selection as selected', () => {
    const el = document.createElement('div')
    el.contentEditable = 'true'
    el.innerHTML = '<span contenteditable="false" class="comment-tag">图1 评论</span>中<span contenteditable="false" class="comment-tag selected">图2 评论</span>'
    document.body.append(el)
    const range = document.createRange()
    range.selectNode(el.firstChild!)
    window.getSelection()!.addRange(range)
    syncCommentTagSelection(el)

    const tags = el.querySelectorAll('.comment-tag')
    expect(tags[0].classList.contains('selected')).toBe(true)
    expect(tags[1].classList.contains('selected')).toBe(false)
  })
})
