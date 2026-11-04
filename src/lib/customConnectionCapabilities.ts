import type { CustomConnectionDefinition, CustomConnectionSubmitMapping } from '../types'

function hasNativeTransparentBackgroundMapping(value: unknown): boolean {
  if (value === '$params.background') return true
  if (Array.isArray(value)) return value.some(hasNativeTransparentBackgroundMapping)
  if (!value || typeof value !== 'object') return false
  return Object.values(value as Record<string, unknown>).some(hasNativeTransparentBackgroundMapping)
}

function customConnectionSubmitSupportsNativeTransparentBackground(mapping: CustomConnectionSubmitMapping): boolean {
  return hasNativeTransparentBackgroundMapping(mapping.body) || hasNativeTransparentBackgroundMapping(mapping.query)
}

export function customConnectionSupportsNativeTransparentBackground(connection: CustomConnectionDefinition): boolean {
  if (!customConnectionSubmitSupportsNativeTransparentBackground(connection.submit)) return false
  return !connection.editSubmit || customConnectionSubmitSupportsNativeTransparentBackground(connection.editSubmit)
}
