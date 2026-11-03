import { describe, expect, it } from 'vitest'
import { getSelectedImageMentionLabel } from './promptImageMentions'
import { updateInputDraftImages } from './inputDraftState'

const imageA = { id: 'image-a', dataUrl: 'data:image/png;base64,a' }
const imageB = { id: 'image-b', dataUrl: 'data:image/png;base64,b' }

describe('input image and mention transforms', () => {
  it('renumbers retained image mentions and clears a mask whose target was removed', () => {
    const draft = {
      prompt: `保留 ${getSelectedImageMentionLabel(1)}，删除 ${getSelectedImageMentionLabel(0)}`,
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
      prompt: `保留 ${getSelectedImageMentionLabel(0)}，删除 @已移除图片`,
      inputImages: [imageB],
      maskDraft: null,
      maskEditorImageId: null,
      updatedAt: 2,
    })
  })

  it('preserves mention position when an image id is replaced by an equivalent image', () => {
    const draft = {
      prompt: `修改 ${getSelectedImageMentionLabel(0)}`,
      inputImages: [imageA],
      maskDraft: null,
      maskEditorImageId: null,
    }

    expect(updateInputDraftImages(draft, [imageB], { equivalentImageIds: { [imageA.id]: imageB.id } })).toMatchObject({
      prompt: `修改 ${getSelectedImageMentionLabel(0)}`,
      inputImages: [imageB],
    })
  })

})
