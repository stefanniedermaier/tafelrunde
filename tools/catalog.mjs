// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Artikel-Katalog prüfen und für die App bauen (plan/01-architektur.md, „Katalog-Pipeline“).
 *
 *   node tools/catalog.mjs validate   Prüft catalog/ingredients/*.yaml und die .cook-Dateien unter catalog/recipes/
 *   node tools/catalog.mjs build      Prüft und schreibt public/catalog/ingredients.json, recipes.json und nutrition.json
 *
 * Artikel: eine Datei je Kategorie; der Dateiname ist die Kategorie-ID.
 * Rezepte: werden mit demselben Parser wie in der App gelesen (src/core, über Vite geladen).
 */
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { CATEGORIES, normalizeName } from '../src/core/catalog/categories.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = join(root, 'catalog', 'ingredients')
const TARGET = join(root, 'public', 'catalog', 'ingredients.json')
const RECIPES = join(root, 'catalog', 'recipes')
const RECIPES_TARGET = join(root, 'public', 'catalog', 'recipes.json')
const NUTRITION = join(root, 'catalog', 'nutrition')
const NUTRITION_TARGET = join(root, 'public', 'catalog', 'nutrition.json')
/** Spalten des BLS-Auszugs in der Reihenfolge von NUTRIENTS (src/core/nutrition). */
const NUTRIENT_COLUMNS = [
  'kcal',
  'kj',
  'fett',
  'fett_gesaettigt',
  'kohlenhydrate',
  'zucker',
  'ballaststoffe',
  'eiweiss',
  'salz',
]
const WEIGHT_KEY = /^[a-z]{1,20}$/
const IMAGES = join(root, 'catalog', 'images')
const IMAGES_TARGET = join(root, 'public', 'catalog', 'images')
/** Fotos im Katalog: klein halten, die App lädt sie offline vor. */
export const MAX_IMAGE_BYTES = 400 * 1024
const IMAGE_TYPES = { '.webp': [0x52, 0x49, 0x46, 0x46], '.jpg': [0xff, 0xd8, 0xff] }
const RECIPE_PATH = /^[a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*)*$/

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

/** Lädt `src/core` über Vite (TypeScript, Importe ohne Dateiendung). */
export async function loadCore() {
  const { createServer } = await import('vite')
  const server = await createServer({
    configFile: false,
    root,
    logLevel: 'error',
    appType: 'custom',
    server: { middlewareMode: true, hmr: false },
    optimizeDeps: { noDiscovery: true, include: [] },
  })
  try {
    return await server.ssrLoadModule('/src/core/index.ts')
  } finally {
    await server.close()
  }
}

function walk(dir) {
  let out = []
  let names
  try {
    names = readdirSync(dir)
  } catch {
    return out
  }
  for (const name of names.sort()) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out = out.concat(walk(full))
    else out.push(full)
  }
  return out
}

/**
 * Liest und prüft alle Katalogrezepte. Fehler: unlesbar, ohne Titel, zu groß,
 * unzulässiger Pfad, nicht auflösbare Referenz, Zyklus. Hinweise: Zutaten,
 * die der Artikelkatalog nicht kennt.
 */
/**
 * Fotos zu Katalogrezepten: `catalog/images/<rezeptpfad>.webp` oder `.jpg`,
 * höchstens 400 KB, nur echte Bilddateien, nur zu vorhandenen Rezepten.
 */
export function loadImages(recipePaths, dir = IMAGES) {
  const errors = []
  const images = new Map()
  for (const file of walk(dir)) {
    const rel = relative(dir, file).split(sep).join('/')
    const ext = Object.keys(IMAGE_TYPES).find((e) => rel.endsWith(e))
    if (!ext) {
      errors.push(`images/${rel}: nur .webp und .jpg erlaubt`)
      continue
    }
    const path = rel.slice(0, -ext.length)
    const bytes = readFileSync(file)
    if (!recipePaths.has(path)) errors.push(`images/${rel}: kein Rezept „${path}.cook“`)
    if (bytes.length > MAX_IMAGE_BYTES) errors.push(`images/${rel}: größer als 400 KB`)
    if (!IMAGE_TYPES[ext].every((b, i) => bytes[i] === b))
      errors.push(`images/${rel}: keine gültige Bilddatei`)
    if (images.has(path)) errors.push(`images/${rel}: mehrere Fotos für „${path}“`)
    images.set(path, { file, image: `images/${rel}` })
  }
  if (errors.length) {
    const error = new Error(`Katalogfotos fehlerhaft:\n  ${errors.join('\n  ')}`)
    error.errors = errors
    throw error
  }
  return images
}

export function loadRecipes(core, ingredients, dir = RECIPES) {
  const errors = []
  const notes = []
  const recipes = []
  for (const file of walk(dir)) {
    const rel = relative(dir, file).split(sep).join('/')
    if (!rel.endsWith('.cook')) {
      errors.push(`${rel}: nur .cook-Dateien erlaubt`)
      continue
    }
    const path = rel.slice(0, -'.cook'.length)
    if (!RECIPE_PATH.test(path))
      errors.push(`${rel}: Pfad nur aus Kleinbuchstaben, Ziffern und Bindestrichen`)
    const source = readFileSync(file, 'utf8')
    if (source.length > core.MAX_RECIPE_CHARS) {
      errors.push(`${rel}: größer als ${core.MAX_RECIPE_CHARS} Zeichen`)
      continue
    }
    const recipe = core.parseRecipe(source)
    for (const w of recipe.warnings) errors.push(`${rel}: ${w}`)
    recipes.push({ path, source, recipe })
  }
  const index = {
    entries: recipes.map((r) => ({
      key: `catalog:${r.path}`,
      scope: 'catalog',
      path: r.path,
      recipe: r.recipe,
    })),
  }
  const known = new Set(
    ingredients.flatMap((i) => [i.name, ...(i.synonyms ?? [])]).map(core.normalizeName),
  )
  for (const entry of index.entries) {
    const check = core.checkReferences(index, entry)
    for (const ref of check.unresolved)
      errors.push(`${entry.path}.cook: Referenz „${ref}“ nicht im Katalog`)
    if (check.cycle) errors.push(`${entry.path}.cook: Zyklus ${check.cycle.join(' → ')}`)
    for (const i of entry.recipe.ingredients) {
      if (!i.reference && !known.has(core.normalizeName(i.name))) {
        notes.push(`${entry.path}.cook: Zutat „${i.name}“ fehlt im Artikelkatalog`)
      }
    }
  }
  if (errors.length) {
    const error = new Error(`Rezepte fehlerhaft:\n  ${errors.join('\n  ')}`)
    error.errors = errors
    throw error
  }
  return {
    notes: [...new Set(notes)],
    recipes: recipes.map((r) => ({
      path: r.path,
      source: r.source,
      version: createHash('sha256').update(r.source).digest('hex').slice(0, 16),
    })),
  }
}

/**
 * Nährwerte (ADR 0004): BLS-Auszug (CC BY 4.0), Zuordnung Artikel → BLS-Code
 * und Gewichtstabelle (beide CC BY-SA 4.0). Fehlt der Ordner, gibt es keine Nährwerte.
 */
export function loadNutrition(items, dir = NUTRITION) {
  const errors = []
  const files = ['zuordnung.yaml', 'gewichte.yaml', 'bls-4.0-auszug.csv']
  if (!files.every((f) => existsSync(join(dir, f)))) return undefined
  const ids = new Set(items.map((i) => i.id))

  const bls = new Map()
  const lines = readFileSync(join(dir, 'bls-4.0-auszug.csv'), 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#'))
  const header = lines.shift()?.split(';') ?? []
  const columns = NUTRIENT_COLUMNS.map((c) => header.indexOf(c))
  if (header[0] !== 'bls' || columns.some((i) => i < 0))
    errors.push('bls-4.0-auszug.csv: Kopfzeile')
  for (const line of lines) {
    const cells = line.split(';')
    // Leer = fehlender Wert (nicht 0, siehe BLS-Dokumentation 4.3) → null
    const values = columns.map((i) => (cells[i] === '' ? null : Number(cells[i])))
    const bad = values.some((v) => v !== null && (!Number.isFinite(v) || v < 0))
    if (!/^[A-Z][0-9A-Z]{6}$/.test(cells[0]) || bad)
      errors.push(`bls-4.0-auszug.csv: Zeile „${cells[0]}“ ungültig`)
    else bls.set(cells[0], values)
  }

  const mapping = parse(readFileSync(join(dir, 'zuordnung.yaml'), 'utf8')) ?? {}
  const foods = {}
  for (const [i, m] of (mapping.items ?? []).entries()) {
    if (!ids.has(m?.id)) errors.push(`zuordnung.yaml[${i}]: unbekannter Artikel „${m?.id}“`)
    else if (!bls.has(m.bls))
      errors.push(`zuordnung.yaml[${i}]: BLS-Code „${m.bls}“ fehlt im Auszug`)
    else if (foods[m.id]) errors.push(`zuordnung.yaml[${i}]: „${m.id}“ doppelt`)
    else foods[m.id] = { n: bls.get(m.bls) }
  }
  for (const [i, m] of (mapping.unmapped ?? []).entries())
    if (!ids.has(m?.id))
      errors.push(`zuordnung.yaml unmapped[${i}]: unbekannter Artikel „${m?.id}“`)

  const weights = parse(readFileSync(join(dir, 'gewichte.yaml'), 'utf8')) ?? {}
  const units = {}
  for (const [key, u] of Object.entries(weights.einheiten ?? {})) {
    const ok = WEIGHT_KEY.test(key) && (u?.ml > 0 || u?.g > 0) && Object.keys(u).length === 1
    if (!ok) errors.push(`gewichte.yaml einheiten.${key}: ungültig`)
    else units[key] = u
  }
  for (const [i, w] of (weights.artikel ?? []).entries()) {
    const where = `gewichte.yaml artikel[${i}] (${w?.id})`
    if (!foods[w?.id]) {
      errors.push(`${where}: Artikel hat keine Nährwerte`)
      continue
    }
    const entry = {}
    for (const [key, value] of Object.entries(w)) {
      if (key === 'id') continue
      if (!(typeof value === 'number' && value > 0)) errors.push(`${where}: ${key} ungültig`)
      else if (key === 'dichte') foods[w.id].d = value
      else if (WEIGHT_KEY.test(key)) entry[key] = value
      else errors.push(`${where}: unbekanntes Feld ${key}`)
    }
    if (Object.keys(entry).length) foods[w.id].w = entry
  }
  if (errors.length) {
    const error = new Error(`Nährwerte fehlerhaft:\n  ${errors.join('\n  ')}`)
    error.errors = errors
    throw error
  }
  return { foods, units }
}

async function main() {
  const command = process.argv[2]
  if (command !== 'validate' && command !== 'build') {
    console.error('Aufruf: node tools/catalog.mjs validate|build')
    process.exit(2)
  }
  let items
  let recipes
  let nutrition
  try {
    items = loadCatalog()
    nutrition = loadNutrition(items)
    const result = loadRecipes(await loadCore(), items)
    for (const note of result.notes) console.warn(`Hinweis: ${note}`)
    const images = loadImages(new Set(result.recipes.map((r) => r.path)))
    recipes = result.recipes.map((r) =>
      images.has(r.path) ? { ...r, image: images.get(r.path).image } : r,
    )
    recipes.images = images
  } catch (e) {
    console.error(e.message)
    process.exit(1)
  }
  if (command === 'build') {
    mkdirSync(dirname(TARGET), { recursive: true })
    writeFileSync(TARGET, JSON.stringify({ version: 1, license: 'CC-BY-SA-4.0', items }))
    writeFileSync(RECIPES_TARGET, JSON.stringify({ version: 1, license: 'CC-BY-SA-4.0', recipes }))
    if (nutrition) {
      writeFileSync(
        NUTRITION_TARGET,
        JSON.stringify({
          version: 1,
          license: 'CC-BY-4.0 (BLS-Auszug), CC-BY-SA-4.0 (Zuordnung, Gewichte)',
          attribution:
            'Max Rubner-Institut (2025): Bundeslebensmittelschlüssel (BLS), Version 4.0 — Deutsche Nährstoffdatenbank. Karlsruhe. DOI: 10.25826/Data20251217-134202-0',
          ...nutrition,
        }),
      )
    } else rmSync(NUTRITION_TARGET, { force: true })
    rmSync(IMAGES_TARGET, { recursive: true, force: true })
    for (const { file, image } of recipes.images.values()) {
      const target = join(root, 'public', 'catalog', image)
      mkdirSync(dirname(target), { recursive: true })
      copyFileSync(file, target)
    }
    console.log(
      `Katalog gebaut: ${items.length} Artikel, ${recipes.length} Rezepte, ${Object.keys(nutrition?.foods ?? {}).length} mit Nährwerten → public/catalog/`,
    )
  } else {
    console.log(
      `Katalog in Ordnung: ${items.length} Artikel, ${recipes.length} Rezepte, ${Object.keys(nutrition?.foods ?? {}).length} mit Nährwerten`,
    )
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
