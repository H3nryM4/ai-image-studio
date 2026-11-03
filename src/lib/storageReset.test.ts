// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  const entries = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
    removeItem: (key: string) => entries.delete(key),
    clear: () => entries.clear(),
  })
})

afterEach(() => {
  localStorage.clear()
  vi.resetModules()
  vi.unstubAllGlobals()
})

describe('local state version reset', () => {
  it('discards old state once and keeps new input and settings on rehydration', async () => {
    localStorage.setItem('ai-image-studio', JSON.stringify({
      version: 2,
      state: { prompt: '旧输入', settings: { apiKey: 'old-test-key' } },
    }))
    const { useStore } = await import('../store')
    await useStore.persist.rehydrate()
    expect(useStore.getState().prompt).toBe('')
    expect(useStore.getState().settings.apiKey).not.toBe('old-test-key')
    useStore.getState().setPrompt('新输入')
    useStore.getState().setSettings({ batchPromptConcurrency: 5 })
    expect(JSON.parse(localStorage.getItem('ai-image-studio')!).version).toBe(3)

    await useStore.persist.rehydrate()
    expect(useStore.getState().prompt).toBe('新输入')
    expect(useStore.getState().settings.batchPromptConcurrency).toBe(5)
  })
})
