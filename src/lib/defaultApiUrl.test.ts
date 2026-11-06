import { describe, expect, it } from 'vitest'
import { buildApiUrl } from './devProxy'
import { parseDefaultApiUrl } from './defaultApiUrl'

describe('parseDefaultApiUrl', () => {
  it('keeps automatic v1 routing for a root URL without a trailing slash', () => {
    const parsed = parseDefaultApiUrl('https://api.example.com')

    expect(parsed.baseUrl).toBe('https://api.example.com')
    expect(buildApiUrl(parsed.baseUrl, 'images/generations')).toBe('https://api.example.com/v1/images/generations')
  })

  it('preserves a trailing slash for direct endpoint joining', () => {
    const parsed = parseDefaultApiUrl('https://api.example.com/')

    expect(parsed.baseUrl).toBe('https://api.example.com/')
    expect(buildApiUrl(parsed.baseUrl, 'images/generations')).toBe('https://api.example.com/images/generations')
  })
})
