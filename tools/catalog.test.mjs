// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadCatalog } from './catalog.mjs'

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
