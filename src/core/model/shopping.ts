// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Einkaufslisten im Dokument `live` (plan/03-phase-1-einkaufsliste.md, 1.10).
 *
 * Listen und Einträge sind jeweils eine eigene `Y.Map`. So überschreibt das
 * Abhaken auf einem Gerät nicht die gleichzeitig geänderte Menge auf einem
 * anderen.
 */

import * as Y from 'yjs'
import {
  type CategoryId,
  DEFAULT_ORDER,
  FALLBACK_CATEGORY,
  isCategoryId,
  normalizeName,
} from '../catalog/categories'
import { randomId } from '../crypto/ids'
import { LIVE_ROOT } from './space'

export interface ShoppingList {
  id: string
  name: string
  createdAt: number
}

export interface Item {
  id: string
  listId: string
  name: string
  quantity: string
  unit: string
  note: string
  /** Fest gewählte Kategorie; sonst wird sie aus Zuordnung und Katalog bestimmt. */
  category?: CategoryId
  checked: boolean
  checkedAt?: number
  createdAt: number
  createdBy: string
}

export type ItemInput = Pick<Item, 'name'> & Partial<Pick<Item, 'quantity' | 'unit' | 'note'>>

/** Liefert die Katalog-Kategorie zu einem normalisierten Namen. */
export type CatalogLookup = (normalizedName: string) => CategoryId | undefined

const lists = (doc: Y.Doc) => doc.getMap<Y.Map<unknown>>(LIVE_ROOT.lists)
const items = (doc: Y.Doc) => doc.getMap<Y.Map<unknown>>(LIVE_ROOT.items)
const overrides = (doc: Y.Doc) => doc.getMap<unknown>(LIVE_ROOT.categoryOverrides)

const str = (m: Y.Map<unknown>, k: string, fallback = '') => {
  const v = m.get(k)
  return typeof v === 'string' ? v : fallback
}
const num = (m: Y.Map<unknown>, k: string) => {
  const v = m.get(k)
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

function cleanName(name: string): string {
  const trimmed = name.replace(/\s+/g, ' ').trim()
  if (!trimmed) throw new Error('Name darf nicht leer sein')
  return trimmed
}

// --- Listen -----------------------------------------------------------------

export function createList(doc: Y.Doc, name: string, now = Date.now()): string {
  const id = randomId()
  const entry = new Y.Map<unknown>()
  doc.transact(() => {
    lists(doc).set(id, entry)
    entry.set('name', cleanName(name))
    entry.set('createdAt', now)
  })
  return id
}

export function renameList(doc: Y.Doc, listId: string, name: string): void {
  lists(doc).get(listId)?.set('name', cleanName(name))
}

export function deleteList(doc: Y.Doc, listId: string): void {
  doc.transact(() => {
    lists(doc).delete(listId)
    for (const [id, entry] of items(doc)) {
      if (str(entry, 'listId') === listId) items(doc).delete(id)
    }
  })
}

export function getLists(doc: Y.Doc): ShoppingList[] {
  const out: ShoppingList[] = []
  lists(doc).forEach((entry, id) => {
    if (entry instanceof Y.Map) {
      out.push({ id, name: str(entry, 'name'), createdAt: num(entry, 'createdAt') ?? 0 })
    }
  })
  return out.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
}

// --- Einträge ---------------------------------------------------------------

function readItem(id: string, entry: Y.Map<unknown>): Item {
  const item: Item = {
    id,
    listId: str(entry, 'listId'),
    name: str(entry, 'name'),
    quantity: str(entry, 'quantity'),
    unit: str(entry, 'unit'),
    note: str(entry, 'note'),
    checked: entry.get('checked') === true,
    createdAt: num(entry, 'createdAt') ?? 0,
    createdBy: str(entry, 'createdBy'),
  }
  const category = entry.get('category')
  if (isCategoryId(category)) item.category = category
  const checkedAt = num(entry, 'checkedAt')
  if (item.checked && checkedAt !== undefined) item.checkedAt = checkedAt
  return item
}

export function addItem(
  doc: Y.Doc,
  listId: string,
  input: ItemInput,
  by: string,
  now = Date.now(),
): string {
  if (!lists(doc).has(listId)) throw new Error('unbekannte Liste')
  const id = randomId()
  const entry = new Y.Map<unknown>()
  doc.transact(() => {
    items(doc).set(id, entry)
    entry.set('listId', listId)
    entry.set('name', cleanName(input.name))
    entry.set('quantity', input.quantity?.trim() ?? '')
    entry.set('unit', input.unit?.trim() ?? '')
    entry.set('note', input.note?.trim() ?? '')
    entry.set('checked', false)
    entry.set('createdAt', now)
    entry.set('createdBy', by)
  })
  return id
}

export function updateItem(
  doc: Y.Doc,
  itemId: string,
  patch: Partial<Pick<Item, 'name' | 'quantity' | 'unit' | 'note'>>,
): void {
  const entry = items(doc).get(itemId)
  if (!entry) return
  doc.transact(() => {
    if (patch.name !== undefined) entry.set('name', cleanName(patch.name))
    for (const key of ['quantity', 'unit', 'note'] as const) {
      const value = patch[key]?.trim()
      if (value !== undefined && value !== str(entry, key)) entry.set(key, value)
    }
  })
}

export function setChecked(doc: Y.Doc, itemId: string, checked: boolean, now = Date.now()): void {
  const entry = items(doc).get(itemId)
  if (!entry || (entry.get('checked') === true) === checked) return
  doc.transact(() => {
    entry.set('checked', checked)
    if (checked) entry.set('checkedAt', now)
    else entry.delete('checkedAt')
  })
}

export function removeItem(doc: Y.Doc, itemId: string): void {
  items(doc).delete(itemId)
}

/** „Erledigte entfernen“: gibt die entfernten Einträge zurück, damit sich das rückgängig machen lässt. */
export function removeChecked(doc: Y.Doc, listId: string): Item[] {
  const removed: Item[] = []
  doc.transact(() => {
    for (const [id, entry] of items(doc)) {
      if (str(entry, 'listId') === listId && entry.get('checked') === true) {
        removed.push(readItem(id, entry))
        items(doc).delete(id)
      }
    }
  })
  return removed
}

/** Stellt entfernte Einträge wieder her (Rückgängig). */
export function restoreItems(doc: Y.Doc, removed: readonly Item[]): void {
  doc.transact(() => {
    for (const item of removed) {
      if (!lists(doc).has(item.listId) || items(doc).has(item.id)) continue
      const entry = new Y.Map<unknown>()
      items(doc).set(item.id, entry)
      for (const [key, value] of Object.entries(item)) {
        if (key !== 'id' && value !== undefined) entry.set(key, value)
      }
    }
  })
}

export function getItems(doc: Y.Doc, listId: string): Item[] {
  const out: Item[] = []
  items(doc).forEach((entry, id) => {
    if (entry instanceof Y.Map && str(entry, 'listId') === listId) out.push(readItem(id, entry))
  })
  return out
}

// --- Kategorien -------------------------------------------------------------

/**
 * Ändert die Kategorie eines Eintrags. Der Haushalt merkt sich die Zuordnung
 * für den Namen, sodass künftige Einträge gleichen Namens dort landen.
 */
export function setItemCategory(doc: Y.Doc, itemId: string, category: CategoryId): void {
  const entry = items(doc).get(itemId)
  if (!entry) return
  doc.transact(() => {
    entry.set('category', category)
    overrides(doc).set(normalizeName(str(entry, 'name')), category)
  })
}

export function categoryFor(
  doc: Y.Doc,
  item: Pick<Item, 'name' | 'category'>,
  lookup: CatalogLookup = () => undefined,
): CategoryId {
  if (item.category) return item.category
  const key = normalizeName(item.name)
  const override = overrides(doc).get(key)
  if (isCategoryId(override)) return override
  return lookup(key) ?? FALLBACK_CATEGORY
}

export interface ItemGroup {
  category: CategoryId
  items: Item[]
}

/**
 * Gruppiert nach Kategorie in der gewünschten Reihenfolge. Innerhalb einer
 * Gruppe stehen offene Einträge alphabetisch vorne, erledigte in der
 * Reihenfolge des Abhakens am Ende.
 */
export function groupItems(
  doc: Y.Doc,
  list: readonly Item[],
  lookup?: CatalogLookup,
  order: readonly CategoryId[] = DEFAULT_ORDER,
): ItemGroup[] {
  const byCategory = new Map<CategoryId, Item[]>()
  for (const item of list) {
    const category = categoryFor(doc, item, lookup)
    const group = byCategory.get(category)
    if (group) group.push(item)
    else byCategory.set(category, [item])
  }
  const rank = (c: CategoryId) => {
    const i = order.indexOf(c)
    return i < 0 ? order.length + DEFAULT_ORDER.indexOf(c) : i
  }
  const collator = new Intl.Collator('de-DE', { sensitivity: 'base' })
  return [...byCategory.entries()]
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([category, group]) => ({
      category,
      items: group.sort((a, b) => {
        if (a.checked !== b.checked) return a.checked ? 1 : -1
        if (a.checked) return (a.checkedAt ?? 0) - (b.checkedAt ?? 0)
        return collator.compare(a.name, b.name) || a.createdAt - b.createdAt
      }),
    }))
}

// --- Doppelte Einträge ------------------------------------------------------

/** Offener Eintrag mit gleichem Namen in derselben Liste, falls vorhanden. */
export function findDuplicate(doc: Y.Doc, listId: string, name: string): Item | undefined {
  const key = normalizeName(name)
  return getItems(doc, listId).find((i) => !i.checked && normalizeName(i.name) === key)
}

/** Leere Menge zählt als 1 („Äpfel“ + „Äpfel 3“ = 4). */
function parseAmount(text: string): number | undefined {
  if (text === '') return 1
  if (!/^\d+([.,]\d+)?$/.test(text)) return undefined
  return Number(text.replace(',', '.'))
}

function formatAmount(value: number): string {
  return String(Math.round(value * 1000) / 1000).replace('.', ',')
}

/**
 * Führt `sourceId` in `targetId` zusammen. Gleiche Einheit und Zahlen werden
 * addiert, sonst werden die Mengen nebeneinander behalten.
 */
export function mergeItems(doc: Y.Doc, targetId: string, sourceId: string): void {
  const target = items(doc).get(targetId)
  const source = items(doc).get(sourceId)
  if (!target || !source || targetId === sourceId) return
  const t = readItem(targetId, target)
  const s = readItem(sourceId, source)
  doc.transact(() => {
    const a = parseAmount(t.quantity)
    const b = parseAmount(s.quantity)
    if (t.unit === s.unit && a !== undefined && b !== undefined) {
      if (t.quantity || s.quantity) target.set('quantity', formatAmount(a + b))
    } else {
      const left = [t.quantity, t.unit].filter(Boolean).join(' ') || '1'
      const right = [s.quantity, s.unit].filter(Boolean).join(' ')
      target.set('quantity', `${left} + ${right}`)
      target.set('unit', '')
    }
    const note = [t.note, s.note].filter(Boolean).join(' · ')
    if (note !== t.note) target.set('note', note)
    items(doc).delete(sourceId)
  })
}
