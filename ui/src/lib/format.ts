/**
 * Byte sizes and timestamps in the host's active locale, through the App SDK's
 * `fmtNumber` and `activeLocale`. Same output as the dashboard's own `fmtBytes`
 * and `fmtDateTimeNumeric`, which a bundle cannot import.
 */

import { activeLocale, fmtNumber } from '@kirocrew/app-sdk'

function roundToDigits(value: number, digits: number): number {
  const step = 10 ** digits
  return (Math.sign(value) * Math.round(Math.abs(value) * step)) / step
}

function fmtUnit(value: number, unit: string, maximumFractionDigits: number): string {
  // A quantity is one atom: no line break between the number and its unit.
  return fmtNumber(value, { style: 'unit', unit, unitDisplay: 'narrow', maximumFractionDigits }).replace(
    / /g,
    '\u00A0',
  )
}

/** SI bytes (divisor 1000), CLDR-narrow units: `500B`, `2kB`, `5.2MB`. */
export function fmtBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return '—'
  if (Math.abs(roundToDigits(bytes, 0)) < 1000) return fmtUnit(roundToDigits(bytes, 0), 'byte', 0)
  const units = ['kilobyte', 'megabyte', 'gigabyte'] as const
  for (let i = 0; i < units.length; i++) {
    const v = roundToDigits(bytes / 1000 ** (i + 1), 1)
    if (Math.abs(v) < 1000) return fmtUnit(v, units[i], 1)
  }
  return fmtUnit(bytes / 1000 ** 4, 'terabyte', 1)
}

function locale(): string {
  try {
    const l = activeLocale()
    return typeof l === 'string' && l ? l : 'en'
  } catch {
    return 'en'
  }
}

/** What `d.toLocaleString()` renders, in the host's locale: all-numeric date and time. */
export function fmtDateTimeNumeric(value: Date): string {
  if (Number.isNaN(value.getTime())) return '—'
  return new Intl.DateTimeFormat(locale(), {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(value)
}
