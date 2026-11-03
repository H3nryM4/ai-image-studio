// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import MarkdownRenderer from './MarkdownRenderer'

describe('profile description markdown', () => {
  it('renders static Markdown and GFM tables', () => {
    const html = renderToStaticMarkup(<MarkdownRenderer content={'**配置说明**\n\n| 模型 | 接口 |\n| --- | --- |\n| 图片 | Images |\n\n[文档](https://example.com)'} />)
    expect(html).toContain('<strong>配置说明</strong>')
    expect(html).toContain('<table>')
    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('rel="noreferrer"')
  })

  it('blocks script links and raw HTML', () => {
    const html = renderToStaticMarkup(<MarkdownRenderer content={'[链接](javascript:alert%281%29)\n\n<script>alert(1)</script>'} />)
    expect(html).toContain('href="#blocked"')
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('<script>')
  })
})
