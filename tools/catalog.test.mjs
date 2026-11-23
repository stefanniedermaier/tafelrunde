// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import * as core from '../src/core/index.ts'
import { loadCatalog, loadRecipes } from './catalog.mjs'

const dirs = []
function fixture(files) {
  const dir = mkdtempSync(join(tmpdir(), 'katalog-'))
  dirs.push(dir)
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content)
  return dir
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true })
})

describe('Katalog', () => {
  it('der echte Katalog ist gültig und umfangreich', () => {
    const items = loadCatalog()
    expect(items.length).toBeGreaterThanOrEqual(290)
    expect(new Set(items.map((i) => i.category)).size).toBe(13)
    expect(items.find((i) => i.id === 'aepfel')).toMatchObject({
      name: 'Äpfel',
      category: 'obst-gemuese',
      synonyms: ['Apfel'],
      diet: 'vegan',
    })
    expect(items.some((i) => i.category === 'drogerie-haushalt' && !i.diet)).toBe(true)
  })

  it('liest Einträge mit Kategorie aus dem Dateinamen', () => {
    const dir = fixture({ 'backen.yaml': '- { id: mehl, name: Mehl, units: [kg] }\n' })
    expect(loadCatalog(dir)).toEqual([
      { id: 'mehl', name: 'Mehl', category: 'backen', units: ['kg'] },
    ])
  })

  it.each([
    ['unbekannte Kategorie', { 'xyz.yaml': '- { id: a, name: A }' }, /unbekannte Kategorie/],
    ['kein YAML', { 'backen.yaml': '- { id: a' }, /kein gültiges YAML/],
    ['keine Liste', { 'backen.yaml': 'id: a' }, /erwartet eine Liste/],
    ['ungültige id', { 'backen.yaml': '- { id: Mehl!, name: Mehl }' }, /ungültige id/],
    ['fehlender Name', { 'backen.yaml': '- { id: mehl }' }, /ungültiger Name/],
    ['unbekanntes Feld', { 'backen.yaml': '- { id: a, name: A, preis: 3 }' }, /unbekanntes Feld/],
    [
      'falsche Ernährungsform',
      { 'backen.yaml': '- { id: a, name: A, diet: keto }' },
      /Ernährungsform/,
    ],
    [
      'doppelte id',
      { 'backen.yaml': '- { id: a, name: A }', 'getraenke.yaml': '- { id: a, name: B }' },
      /doppelt/,
    ],
    [
      'Synonym mehrfach vergeben',
      { 'backen.yaml': '- { id: a, name: Zucker }\n- { id: b, name: B, synonyms: [zucker] }' },
      /schon bei „a“ vergeben/,
    ],
  ])('meldet %s', (_, files, message) => {
    expect(() => loadCatalog(fixture(files))).toThrow(message)
  })
})

describe('Katalogrezepte', () => {
  const ingredients = [{ id: 'mehl', name: 'Mehl', category: 'backen' }]
  const cook = (title, body = '') => `---\ntitle: ${title}\n---\n${body}`

  it('die echten Rezepte sind gültig und haben eine Version', () => {
    const { recipes } = loadRecipes(core, loadCatalog())
    expect(recipes.map((r) => r.path)).toContain('backen/hefeteig')
    expect(recipes.find((r) => r.path === 'backen/hefeteig').version).toMatch(/^[0-9a-f]{16}$/)
  })

  it('meldet unbekannte Zutaten nur als Hinweis', () => {
    const dir = fixture({ 'a.cook': cook('A', '@Mehl{1%g} @Drachenfrucht{1}') })
    expect(loadRecipes(core, ingredients, dir).notes).toEqual([
      'a.cook: Zutat „Drachenfrucht“ fehlt im Artikelkatalog',
    ])
  })

  it.each([
    [
      'nicht auflösbare Referenz',
      { 'a.cook': cook('A', '@./Fehlt{1}') },
      /Referenz „Fehlt“ nicht im Katalog/,
    ],
    ['Zyklus', { 'a.cook': cook('A', '@./b{1}'), 'b.cook': cook('B', '@./a{1}') }, /Zyklus/],
    ['fehlender Titel', { 'a.cook': 'Nur Text' }, /Titel fehlt/],
    ['falscher Pfad', { 'Groß.cook': cook('A') }, /Pfad nur aus Kleinbuchstaben/],
    ['falsche Endung', { 'a.txt': 'x' }, /nur .cook-Dateien/],
    ['zu groß', { 'a.cook': cook('A', 'x'.repeat(60_000)) }, /größer als/],
  ])('meldet %s', (_, files, message) => {
    expect(() => loadRecipes(core, ingredients, fixture(files))).toThrow(message)
  })
})
