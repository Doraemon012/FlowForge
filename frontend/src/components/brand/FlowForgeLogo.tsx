import { cn } from '@/lib/utils'

/**
 * The FlowForge glyph: one source task fanning out to two dependents. It is
 * the product's actual concept reduced to three rounded blocks and two edges,
 * so it stays legible at 16px (favicon) and reads as a workflow graph rather
 * than an abstract monogram.
 *
 * Drawn in `currentColor` so it inherits the tile's ink colour (navbar, auth,
 * docs) or can be rendered standalone in the accent colour.
 */
export function FlowForgeGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn('h-full w-full', className)}
      aria-hidden="true"
      fill="none"
    >
      <path
        d="M13.5 16 L18.5 8.75 M13.5 16 L18.5 23.25"
        stroke="currentColor"
        strokeWidth={2.7}
        strokeLinecap="round"
      />
      <rect x="4" y="11.25" width="9.5" height="9.5" rx="2.4" fill="currentColor" />
      <rect x="18.5" y="4.25" width="9" height="9" rx="2.3" fill="currentColor" />
      <rect x="18.5" y="18.75" width="9" height="9" rx="2.3" fill="currentColor" />
    </svg>
  )
}

interface FlowForgeMarkProps {
  /** Rendered size of the accent tile in pixels. Defaults to 26 (nav scale). */
  size?: number
  className?: string
}

/**
 * The standalone app mark: the accent tile with the glyph knocked out in ink.
 * Used as the favicon-parity icon wherever the wordmark is not wanted.
 */
export function FlowForgeMark({ size = 26, className }: FlowForgeMarkProps) {
  return (
    <span
      className={cn('logo-mark', className)}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <FlowForgeGlyph className="h-[62%] w-[62%]" />
    </span>
  )
}

interface FlowForgeLogoProps {
  /** Mark tile size in pixels. */
  size?: number
  /** Hide the wordmark to render the bare mark (e.g. a collapsed rail). */
  showWordmark?: boolean
  className?: string
  wordmarkClassName?: string
  /** Accessible name for the lockup. Defaults to "FlowForge". */
  label?: string
}

/**
 * The FlowForge lockup: mark plus wordmark. This is the single identity used
 * in the marketing nav, auth, docs chrome, and the app shell so branding stays
 * consistent everywhere.
 */
export function FlowForgeLogo({
  size = 26,
  showWordmark = true,
  className,
  wordmarkClassName,
  label = 'FlowForge',
}: FlowForgeLogoProps) {
  return (
    <span className={cn('logo', className)} aria-label={label}>
      <FlowForgeMark size={size} />
      {showWordmark ? <span className={wordmarkClassName}>{label}</span> : null}
    </span>
  )
}
