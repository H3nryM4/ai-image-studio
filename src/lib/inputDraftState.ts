import type { InputImage, MaskDraft } from '../types'
import { remapImageMentionsForOrder } from './promptImageMentions'

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
    prompt: remapImageMentionsForOrder(draft.prompt, draft.inputImages, inputImages, options.equivalentImageIds),
    ...(shouldClearMask ? { maskDraft: null, maskEditorImageId: null } : {}),
  }
}
