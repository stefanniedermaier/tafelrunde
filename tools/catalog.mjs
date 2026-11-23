// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Artikel-Katalog prüfen und für die App bauen (plan/01-architektur.md, „Katalog-Pipeline“).
 *
 *   node tools/catalog.mjs validate   Prüft catalog/ingredients/*.yaml
 *   node tools/catalog.mjs build      Prüft und schreibt public/catalog/ingredients.json
 *
 * Eine Datei je Kategorie; der Dateiname ist die Kategorie-ID.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { CATEGORIES, normalizeName } from '../src/core/catalog/categories.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = join(root, 'catalog', 'ingredients')
const TARGET = join(root, 'public', 'catalog', 'ingredients.json')

const CATEGORY_IDS = new Set(CATEGORIES.map((c) => c.id))
const DIETS = new Set(['vegan', 'vegetarisch', 'pescetarisch', 'omnivor'])
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/
const FIELDS = new Set(['id', 'name', 'synonyms', 'diet', 'units'])

/** Liest und prüft alle Dateien; liefert Einträge oder wirft mit allen Fehlern. */
export function loadCatalog(dir = SOURCE) {
  const errors = []
  const items = []
  const ids = new Map()
  const names = new Map()

  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith('.yaml'))
    .sort()) {
    const category = basename(file, '.yaml')
    const where = (i) => `${file}[${i}]`
    if (!CATEGORY_IDS.has(category)) {
      errors.push(`${file}: unbekannte Kategorie „${category}“`)
      continue
    }
    let data
    try {
      data = parse(readFileSync(join(dir, file), 'utf8'))
    } catch (e) {
      errors.push(`${file}: kein gültiges YAML – ${e.message}`)
      continue
    }
    if (!Array.isArray(data)) {
      errors.push(`${file}: erwartet eine Liste`)
      continue
    }
    data.forEach((entry, i) => {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
        errors.push(`${where(i)}: erwartet ein Objekt`)
        return
      }
      for (const key of Object.keys(entry)) {
        if (!FIELDS.has(key)) errors.push(`${where(i)}: unbekanntes Feld „${key}“`)
      }
      const { id, name, synonyms = [], diet, units = [] } = entry
      if (typeof id !== 'string' || !ID.test(id)) errors.push(`${where(i)}: ungültige id „${id}“`)
      if (typeof name !== 'string' || !name.trim() || name.length > 60) {
        errors.push(`${where(i)}: ungültiger Name`)
      }
      const stringList = (v) =>
        Array.isArray(v) && v.every((s) => typeof s === 'string' && s.trim())
      if (!stringList(synonyms))
        errors.push(`${where(i)}: synonyms muss eine Liste von Texten sein`)
      if (!stringList(units)) errors.push(`${where(i)}: units muss eine Liste von Texten sein`)
      if (diet !== undefined && !DIETS.has(diet))
        errors.push(`${where(i)}: unbekannte Ernährungsform „${diet}“`)
      if (typeof id !== 'string' || typeof name !== 'string') return

      if (ids.has(id)) errors.push(`${where(i)}: id „${id}“ doppelt (auch in ${ids.get(id)})`)
      ids.set(id, file)
      // Jeder Name und jedes Synonym darf nur einmal vorkommen, sonst ist die Kategorie mehrdeutig.
      for (const label of [name, ...(stringList(synonyms) ? synonyms : [])]) {
        const key = normalizeName(label)
        const other = names.get(key)
        if (other && other !== id)
          errors.push(`${where(i)}: „${label}“ ist schon bei „${other}“ vergeben`)
        names.set(key, id)
      }
      const item = { id, name: name.trim(), category }
      if (stringList(synonyms) && synonyms.length) item.synonyms = synonyms.map((s) => s.trim())
      if (diet) item.diet = diet
      if (stringList(units) && units.length) item.units = units.map((u) => u.trim())
      items.push(item)
    })
  }
  if (errors.length) {
    const error = new Error(`Katalog fehlerhaft:\n  ${errors.join('\n  ')}`)
    error.errors = errors
    throw error
  }
  return items.sort((a, b) => a.id.localeCompare(b.id))
}

function main() {
  const command = process.argv[2]
  if (command !== 'validate' && command !== 'build') {
    console.error('Aufruf: node tools/catalog.mjs validate|build')
    process.exit(2)
  }
  let items
  try {
    items = loadCatalog()
  } catch (e) {
    console.error(e.message)
    process.exit(1)
  }
  if (command === 'build') {
    mkdirSync(dirname(TARGET), { recursive: true })
    writeFileSync(TARGET, JSON.stringify({ version: 1, license: 'CC-BY-SA-4.0', items }))
    console.log(`Katalog gebaut: ${items.length} Artikel → ${TARGET.slice(root.length + 1)}`)
  } else {
    console.log(`Katalog in Ordnung: ${items.length} Artikel`)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
