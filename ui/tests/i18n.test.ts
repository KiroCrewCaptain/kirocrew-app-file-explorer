/**
 * The app's own catalogs and the lookup over them.
 *
 * The bundle cannot read the dashboard's catalogs, so a missing key here is an
 * untranslated (or raw-key) string on screen in that locale. These pin the
 * fallback order, the plural forms, that every shipped locale covers every
 * English key with the same placeholders, and that every key the source asks
 * for exists.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CATALOGS, localeChain, t } from '../src/i18n'
import { stubLocale } from './stubs/app-sdk'

type Tree = { [key: string]: string | Tree }

function flatten(tree: Tree, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(tree)) {
    if (typeof value === 'string') out[prefix + key] = value
    else Object.assign(out, flatten(value, `${prefix}${key}.`))
  }
  return out
}

const PLURAL = /_(zero|one|two|few|many|other)$/
/** A plural family counts once: its base key. */
const family = (key: string) => key.replace(PLURAL, '')
const placeholders = (text: string) => [...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort()

describe('lookup order', () => {
  it('uses the exact locale first', () => {
    stubLocale('zh-CN')
    expect(t('fileViewer.reload')).toBe(flatten(CATALOGS['zh-CN'])['fileViewer.reload'])
    expect(t('fileViewer.reload')).not.toBe('Reload')
  })

  it('falls back to the base language for a regional variant', () => {
    stubLocale('pt-BR')
    expect(localeChain('pt-BR')).toEqual(['pt', 'en'])
    expect(t('fileViewer.reload')).toBe(flatten(CATALOGS.pt)['fileViewer.reload'])
  })

  it('falls back to English for a language it does not ship', () => {
    stubLocale('sv')
    expect(localeChain('sv')).toEqual(['en'])
    expect(t('fileViewer.reload')).toBe('Reload')
  })

  it('shows the key when no catalog has it', () => {
    expect(t('nope.not_a_key')).toBe('nope.not_a_key')
    expect(t('fileViewer')).toBe('fileViewer')
  })

  it('does not read inherited object properties as keys', () => {
    expect(t('constructor')).toBe('constructor')
    expect(t('fileViewer.toString')).toBe('fileViewer.toString')
  })
})

describe('interpolation and plurals', () => {
  it('fills placeholders and leaves an unsupplied one as written', () => {
    expect(t('searchPanel.search_in', { name: 'notes' })).toBe('Search in notes')
    expect(t('searchPanel.search_in')).toBe('Search in {{name}}')
  })

  it("picks the locale's plural form for a count", () => {
    expect(t('common.result_count', { count: 1 })).toBe('1 result')
    expect(t('common.result_count', { count: 3 })).toBe('3 results')
    stubLocale('ru')
    const ru = flatten(CATALOGS.ru)
    expect(t('common.result_count', { count: 3 })).toBe(ru['common.result_count_few'].replace('{{count}}', '3'))
    expect(t('common.result_count', { count: 5 })).toBe(ru['common.result_count_many'].replace('{{count}}', '5'))
  })

  it('falls back to the other form when a locale lacks the exact one', () => {
    stubLocale('ja')
    expect(t('common.result_count', { count: 1 })).toBe(flatten(CATALOGS.ja)['common.result_count_other'].replace('{{count}}', '1'))
  })
})

describe('catalog coverage', () => {
  const english = flatten(CATALOGS.en)
  const englishFamilies = [...new Set(Object.keys(english).map(family))].sort()

  it('ships every dashboard locale', () => {
    expect(Object.keys(CATALOGS).sort()).toEqual(
      ['bn', 'de', 'en', 'es', 'fr', 'hi', 'it', 'ja', 'ko', 'pt', 'ru', 'zh-CN'].sort(),
    )
  })

  for (const [locale, catalog] of Object.entries(CATALOGS)) {
    it(`${locale} has exactly the English keys, with the same placeholders`, () => {
      const strings = flatten(catalog)
      expect([...new Set(Object.keys(strings).map(family))].sort()).toEqual(englishFamilies)
      for (const [key, text] of Object.entries(strings)) {
        expect(text.trim(), `${locale} ${key}`).not.toBe('')
        const englishText = english[key] ?? english[`${family(key)}_other`]
        expect(placeholders(text), `${locale} ${key}`).toEqual(placeholders(englishText))
        if (PLURAL.test(key)) expect(strings[`${family(key)}_other`], `${locale} ${key}`).toBeDefined()
      }
    })
  }

  it('every key the page asks for exists in English', () => {
    const dir = join(__dirname, '..', 'src')
    const files = readdirSync(dir).filter((f) => /\.tsx?$/.test(f))
    const asked = new Set<string>()
    for (const f of files) {
      for (const m of readFileSync(join(dir, f), 'utf8').matchAll(/i18nT\('([\w.]+)'/g)) asked.add(m[1])
    }
    expect(asked.size).toBeGreaterThan(30)
    for (const key of asked) {
      expect(englishFamilies, key).toContain(key)
    }
  })
})
