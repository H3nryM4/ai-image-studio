// @vitest-environment jsdom
import { act, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useCloseOnEscape } from '../../hooks/useCloseOnEscape'
import CustomConnectionModal from './CustomConnectionModal'

afterEach(() => vi.unstubAllGlobals())

describe('custom connection modal', () => {
  it('closes the editor with Escape while keeping its parent settings open', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    const closeSettings = vi.fn()
    function Settings() {
      const [editing, setEditing] = useState(false)
      const ref = useRef<HTMLDivElement>(null)
      useCloseOnEscape(true, closeSettings)
      return <>
        <button onClick={() => setEditing(true)}>打开编辑器</button>
        {editing && <CustomConnectionModal
          editing={false}
          json="{}"
          error={null}
          isImportingJson={false}
          scrollBoundaryRef={ref}
          onClose={() => setEditing(false)}
          onCopyLlmPrompt={() => {}}
          onImportJson={() => {}}
          onJsonChange={() => {}}
          onSave={() => {}}
        />}
      </>
    }
    const el = document.createElement('div')
    document.body.appendChild(el)
    const root = createRoot(el)
    try {
      await act(async () => root.render(<Settings />))
      await act(async () => el.querySelector('button')!.click())
      expect(document.querySelector('textarea')).not.toBeNull()
      await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
      expect(document.querySelector('textarea')).toBeNull()
      expect(closeSettings).not.toHaveBeenCalled()
      await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
      expect(closeSettings).toHaveBeenCalledOnce()
    } finally {
      await act(async () => root.unmount())
      el.remove()
    }
  })
})
