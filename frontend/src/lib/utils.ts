import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—'
  const value = new Date(date)
  if (Number.isNaN(value.getTime())) return '—'
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(value)
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '—'
  const value = new Date(date)
  if (Number.isNaN(value.getTime())) return '—'
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(value)
}

const NOON_HOUR = 12
const EVENING_HOUR = 18

/**
 * Time-of-day greeting for the dashboard. It takes the hour (0-23) rather than
 * reading the clock itself so the message stays testable and correct in every
 * timezone the viewer happens to be in.
 */
export function greetingForHour(hour: number): string {
  if (hour < NOON_HOUR) return 'Good morning'
  if (hour < EVENING_HOUR) return 'Good afternoon'
  return 'Good evening'
}
