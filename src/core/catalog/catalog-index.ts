// SPDX-License-Identifier: AGPL-3.0-or-later

import { type CategoryId, isCategoryId, normalizeName } from './categories'

export type Diet = 'vegan' | 'vegetarisch' | 'pescetarisch' | 'omnivor'

export interface CatalogItem {
  id: string
  name: string
  category: CategoryId
  synonyms?: string[]
  diet?: Diet
  units?: string[]
}

export interface CatalogIndex {
  /** Kategorie zu einem normalisierten Namen oder Synonym. */
  lookup(normalizedName: string): CategoryId | undefined
  /** Anzeigenamen für Vorschläge. */
  names: string[]
  size: number
}

export const EMPTY_CATALOG: CatalogIndex = { lookup: () => undefined, names: [], size: 0 }

/** Baut den Index aus der (untrusted) Katalogdatei; ungültige Einträge werden übersprungen. */
export function buildCatalogIndex(data: unknown): CatalogIndex {
  const items =
    typeof data === 'object' && data !== null && Array.isArray((data as { items?: unknown }).items)
      ? ((data as { items: unknown[] }).items as Partial<CatalogItem>[])
      : []
  const byName = new Map<string, CategoryId>()
  const names: string[] = []
  for (const item of items) {
    if (typeof item?.name !== 'string' || !isCategoryId(item.category)) continue
    names.push(item.name)
    for (const label of [item.name, ...(Array.isArray(item.synonyms) ? item.synonyms : [])]) {
      if (typeof label === 'string') byName.set(normalizeName(label), item.category)
    }
  }
  return {
    lookup: (key) => byName.get(key),
    names: names.sort((a, b) => a.localeCompare(b, 'de')),
    size: names.length,
  }
}
