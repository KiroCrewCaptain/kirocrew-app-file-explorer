/**
 * The app's own strings. A bundle cannot read the dashboard's catalogs (those
 * belong to the host and change with it), so every locale the dashboard ships is
 * bundled here and looked up against the host's active language.
 *
 * Lookup order: the exact locale (`pt`, `zh-CN`), then its base language, then
 * English, then the key itself, so a missing translation shows English rather
 * than nothing. `{{name}}` placeholders are filled from `vars`; one with no value
 * is left as written. With a numeric `count`, the CLDR plural form of that
 * locale is tried first (`result_count_one`, `_few`, `_many`, `_other`), the
 * same key shape the dashboard's catalogs use.
 *
 * `t` reads the language at call time. The root component subscribes to the
 * host's language changes (`useLanguageGeneration`), and its re-render reaches
 * every child, so a language switch repaints the page without a reload.
 */

import { activeLocale } from '@kirocrew/app-sdk'
import bn from '../i18n/bn.json'
import de from '../i18n/de.json'
import en from '../i18n/en.json'
import es from '../i18n/es.json'
import fr from '../i18n/fr.json'
import hi from '../i18n/hi.json'
import it from '../i18n/it.json'
import ja from '../i18n/ja.json'
import ko from '../i18n/ko.json'
import pt from '../i18n/pt.json'
import ru from '../i18n/ru.json'
import zhCN from '../i18n/zh-CN.json'

interface Catalog {
  [key: string]: string | Catalog
}

export const CATALOGS: Readonly<Record<string, Catalog>> = {
  bn,
  de,
  en,
  es,
  fr,
  hi,
  it,
  ja,
  ko,
  pt,
  ru,
  'zh-CN': zhCN,
}

const own = (obj: object, key: string) => Object.prototype.hasOwnProperty.call(obj, key)

function lookup(catalog: Catalog | undefined, key: string): string | undefined {
  let node: string | Catalog | undefined = catalog
  for (const part of key.split('.')) {
    if (node === undefined || typeof node === 'string' || !own(node, part)) return undefined
    node = node[part]
  }
  return typeof node === 'string' ? node : undefined
}

/** The catalogs to try for `locale`, most specific first, always ending in English. */
export function localeChain(locale: string): string[] {
  const chain: string[] = []
  const add = (candidate: string) => {
    if (own(CATALOGS, candidate) && !chain.includes(candidate)) chain.push(candidate)
  }
  add(locale)
  add(locale.split('-')[0])
  add('en')
  return chain
}

function currentLocale(): string {
  try {
    const locale = activeLocale()
    return typeof locale === 'string' && locale ? locale : 'en'
  } catch {
    return 'en'
  }
}

const PLACEHOLDER = /\{\{\s*(\w+)\s*\}\}/g

function pluralSuffix(locale: string, count: number): string {
  try {
    return new Intl.PluralRules(locale).select(count)
  } catch {
    return 'other'
  }
}

function fill(text: string, vars?: Record<string, string | number>): string {
  return text.replace(PLACEHOLDER, (whole, name: string) =>
    vars && own(vars, name) ? String(vars[name]) : whole,
  )
}

export function t(key: string, vars?: Record<string, string | number>): string {
  const count = vars && typeof vars.count === 'number' ? vars.count : undefined
  for (const locale of localeChain(currentLocale())) {
    const catalog = CATALOGS[locale]
    if (count !== undefined) {
      const forms = [`${key}_${pluralSuffix(locale, count)}`, `${key}_other`]
      for (const form of forms) {
        const text = lookup(catalog, form)
        if (text !== undefined) return fill(text, vars)
      }
    }
    const text = lookup(catalog, key)
    if (text !== undefined) return fill(text, vars)
  }
  return key
}

/** The name the page's components call `t` by, kept from the built-in. */
export const i18nT = t
