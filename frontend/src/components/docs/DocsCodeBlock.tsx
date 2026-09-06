import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

interface DocsCodeBlockProps {
  code: string
  language?: string
  title?: string
}

export function DocsCodeBlock({ code, language, title }: DocsCodeBlockProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Ignore clipboard failures; the button simply won't show "Copied!".
    }
  }

  return (
    <div className="docs-code-block">
      <div className="docs-code-head">
        <span className="dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        {title ? <span className="filename">{title}</span> : <span className="filename" />}
        {language ? <span className="lang">{language}</span> : null}
      </div>
      <button
        type="button"
        className="docs-code-copy"
        onClick={handleCopy}
        aria-label={copied ? 'Copied code' : 'Copy code'}
      >
        {copied ? (
          <Check className="h-3 w-3" aria-hidden="true" />
        ) : (
          <Copy className="h-3 w-3" aria-hidden="true" />
        )}
        {copied ? 'Copied!' : 'Copy'}
      </button>
      <div className="docs-code-body" role="region" aria-label={title ?? 'Code example'}>
        <pre>{code}</pre>
      </div>
    </div>
  )
}
