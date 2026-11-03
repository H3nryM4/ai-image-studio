import { memo } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

const allowedUrlProtocols = new Set(['http:', 'https:', 'mailto:', 'tel:'])

function safeUrl(url: string) {
  try {
    return allowedUrlProtocols.has(new URL(url, window.location.origin).protocol) ? url : '#blocked'
  } catch {
    return '#blocked'
  }
}

const components: Components = {
  a({ children, href, ...props }) {
    const safeHref = safeUrl(href ?? '')
    const openBlank = safeHref !== '#blocked'
    return <a {...props} href={safeHref} rel={openBlank ? 'noreferrer' : undefined} target={openBlank ? '_blank' : undefined}>{children}</a>
  },
}

const MarkdownRenderer = memo(function MarkdownRenderer({ content, className = '' }: { content: string; className?: string }) {
  return (
    <div className={`markdown-renderer ${className}`.trim()} dir="auto">
      <ReactMarkdown components={components} remarkPlugins={[remarkGfm]} urlTransform={safeUrl} skipHtml>
        {content}
      </ReactMarkdown>
    </div>
  )
})

export default MarkdownRenderer
