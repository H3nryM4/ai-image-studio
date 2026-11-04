import { describe, expect, it } from 'vitest'
import { getImageCommentToken } from './promptImageComments'
import { updateInputDraftImages } from './inputDraftState'

const imageA = { id: 'image-a', dataUrl: 'data:image/png;base64,a' }
const imageB = { id: 'image-b', dataUrl: 'data:image/png;base64,b' }
const comments = [{ x: 0.5, y: 0.5, text: '修改颜色' }]

describe('input image and comment transforms', () => {
  it('renumbers retained comments and clears a mask whose target was removed', () => {
    const draft = {
      prompt: `保留 ${getImageCommentToken(1, comments)}，删除 ${getImageCommentToken(0, comments)}`,
      inputImages: [imageA, imageB],
      maskDraft: {
        targetImageId: imageA.id,
        maskDataUrl: 'data:image/png;base64,mask',
        updatedAt: 1,
      },
      maskEditorImageId: imageA.id,
      updatedAt: 2,
    }

    expect({ ...draft, ...updateInputDraftImages(draft, [imageB]) }).toEqual({
      prompt: `保留 ${getImageCommentToken(0, comments)}，删除 `,
      inputImages: [imageB],
      maskDraft: null,
      maskEditorImageId: null,
      updatedAt: 2,
    })
  })

  it('preserves comments when an image id is replaced by an equivalent image', () => {
    const draft = {
      prompt: `修改 ${getImageCommentToken(0, comments)}`,
      inputImages: [imageA],
      maskDraft: null,
      maskEditorImageId: null,
    }

    expect(updateInputDraftImages(draft, [imageB], { equivalentImageIds: { [imageA.id]: imageB.id } })).toMatchObject({
      prompt: `修改 ${getImageCommentToken(0, comments)}`,
      inputImages: [imageB],
    })
  })

  it('leaves ordinary image descriptions unchanged when images are reordered or removed', () => {
    const draft = { prompt: '第一张图的人物，第二张图的画风，@图1', inputImages: [imageA, imageB], maskDraft: null }
    expect(updateInputDraftImages(draft, [imageB, imageA]).prompt).toBe(draft.prompt)
    expect(updateInputDraftImages(draft, []).prompt).toBe(draft.prompt)
  })

})
