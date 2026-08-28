import { describe, expect, it } from 'vitest'
import { cn, formatDate, formatDateTime } from '@/lib/utils'

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('p-4', 'bg-red-500')).toBe('p-4 bg-red-500')
  })

  it('resolves conditional class names', () => {
    expect(cn('p-4', false && 'hidden', 'text-sm')).toBe('p-4 text-sm')
  })

  it('de-duplicates conflicting tailwind classes', () => {
    expect(cn('p-4', 'p-2')).toBe('p-2')
  })
})

describe('formatDate', () => {
  it('formats a date', () => {
    expect(formatDate('2024-01-15T00:00:00Z')).toMatch(
      /Jan 15, 2024|Jan 15 2024|Jan 15, 2024/i,
    )
  })

  it('returns an em dash for missing dates', () => {
    expect(formatDate(null)).toBe('—')
    expect(formatDate(undefined)).toBe('—')
  })
})

describe('formatDateTime', () => {
  it('formats a date with time', () => {
    const value = formatDateTime('2024-01-15T12:30:00Z')
    expect(value).toContain('Jan 15, 2024')
  })

  it('returns an em dash for invalid dates', () => {
    expect(formatDateTime('not-a-date')).toBe('—')
  })
})
