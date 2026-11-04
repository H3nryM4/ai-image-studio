import type { InputImage, MaskDraft } from '../types'
import { remapImageCommentsForOrder } from './promptImageComments'

type InputDraftFields = {
  prompt: string
  inputImages: InputImage[]
  maskDraft: MaskDraft | null
}

export function updateInputDraftImages(
  draft: InputDraftFields,
  inputImages: InputImage[],
  options: { equivalentImageIds?: Record<string, string>; clearMissingMask?: boolean } = {},
) {
  const shouldClearMask = options.clearMissingMask !== false && Boolean(draft.maskDraft) && !inputImages.some((img) => img.id === draft.maskDraft?.targetImageId)
  return {
    inputImages,
    prompt: remapImageCommentsForOrder(draft.prompt, draft.inputImages, inputImages, options.equivalentImageIds),
    ...(shouldClearMask ? { maskDraft: null, maskEditorImageId: null } : {}),
  }
}
