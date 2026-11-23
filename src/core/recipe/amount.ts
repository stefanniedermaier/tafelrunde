// SPDX-License-Identifier: AGPL-3.0-or-later

/** Mengen in Rezepten: Zahl, Spanne oder Text, mit deutscher Formatierung und Einheiten-Umrechnung. */

export type Amount =
  | { kind: 'number'; value: number; unit: string; scalable: boolean }
  | { kind: 'range'; min: number; max: number; unit: string; scalable: boolean }
  | { kind: 'text'; text: string; unit: string }

/** Basiseinheiten für Umrechnung und Zusammenfassen (Gewicht, Volumen). */
const UNITS: Record<string, { base: string; factor: number }> = {
  mg: { base: 'g', factor: 0.001 },
  g: { base: 'g', factor: 1 },
  kg: { base: 'g', factor: 1000 },
  ml: { base: 'ml', factor: 1 },
  cl: { base: 'ml', factor: 10 },
  dl: { base: 'ml', factor: 100 },
  l: { base: 'ml', factor: 1000 },
}

export function unitInfo(unit: string): { base: string; factor: number } {
  return UNITS[unit.trim().toLowerCase()] ?? { base: unit.trim(), factor: 1 }
}

/** Umrechnungsfaktor von `from` nach `to`, falls gleiche Größe (z. B. kg → g = 1000). */
export function conversion(from: string, to: string): number | undefined {
  const a = unitInfo(from)
  const b = unitInfo(to)
  return a.base.toLowerCase() === b.base.toLowerCase() ? a.factor / b.factor : undefined
}

export function scaleAmount(amount: Amount, factor: number): Amount {
  if (amount.kind === 'number' && amount.scalable)
    return { ...amount, value: amount.value * factor }
  if (amount.kind === 'range' && amount.scalable) {
    return { ...amount, min: amount.min * factor, max: amount.max * factor }
  }
  return amount
}

/** Zahl auf sinnvolle Stellen runden und mit Komma ausgeben („1,5“, „0,25“, „333“). */
export function formatNumber(value: number): string {
  const abs = Math.abs(value)
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2
  const rounded = Number(value.toFixed(digits))
  return rounded.toLocaleString('de-DE', { maximumFractionDigits: digits, useGrouping: false })
}

/**
 * Wechselt bei großen oder kleinen Werten in die passende Einheit
 * (1500 g → 1,5 kg; 0,25 l → 250 ml), damit skalierte Mengen lesbar bleiben.
 */
function readableUnit(value: number, unit: string): { value: number; unit: string } {
  const u = unit.toLowerCase()
  if (u === 'g' && value >= 1000) return { value: value / 1000, unit: 'kg' }
  if (u === 'kg' && value < 1) return { value: value * 1000, unit: 'g' }
  if (u === 'ml' && value >= 1000) return { value: value / 1000, unit: 'l' }
  if (u === 'l' && value < 1) return { value: value * 1000, unit: 'ml' }
  return { value, unit }
}

export function formatAmount(amount: Amount | undefined): string {
  if (!amount) return ''
  if (amount.kind === 'text') return [amount.text, amount.unit].filter(Boolean).join(' ')
  if (amount.kind === 'number') {
    const r = readableUnit(amount.value, amount.unit)
    return [formatNumber(r.value), r.unit].filter(Boolean).join(' ')
  }
  const r = readableUnit(amount.max, amount.unit)
  const f = r.value / amount.max || 1
  return [`${formatNumber(amount.min * f)}–${formatNumber(r.value)}`, r.unit]
    .filter(Boolean)
    .join(' ')
}

/** Summe zweier Mengen, falls zusammenfassbar (gleiche Größe, beide Zahlen). */
export function addAmounts(a: Amount, b: Amount): Amount | undefined {
  if (a.kind !== 'number' || b.kind !== 'number') return undefined
  const factor = conversion(b.unit, a.unit)
  if (factor === undefined) return undefined
  return { ...a, value: a.value + b.value * factor, scalable: a.scalable || b.scalable }
}

/** Liest Mengenangaben wie „800 g“, „1,5 kg“ oder „2 Bleche“. */
export function parseQuantity(text: string): { value: number; unit: string } | undefined {
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*(.*?)\s*$/.exec(text)
  if (!m) return undefined
  return { value: Number(m[1]!.replace(',', '.')), unit: m[2] ?? '' }
}

/** Liest Dauern wie „20 min“, „1 h 30 min“, „1,5 Std.“ oder „90“ in Minuten. */
export function parseDuration(text: string): number | undefined {
  let total = 0
  let found = false
  const re = /(\d+(?:[.,]\d+)?)\s*(h|std\.?|stunden?|min\.?|minuten?|m)?/gi
  for (const m of text.matchAll(re)) {
    const value = Number(m[1]!.replace(',', '.'))
    const unit = (m[2] ?? 'min').toLowerCase()
    total +=
      unit.startsWith('h') || unit.startsWith('std') || unit.startsWith('stunde')
        ? value * 60
        : value
    found = true
  }
  return found ? Math.round(total) : undefined
}

/** Timer-Dauer in Sekunden. */
export function timerSeconds(amount: Amount): number | undefined {
  const value =
    amount.kind === 'number' ? amount.value : amount.kind === 'range' ? amount.min : undefined
  if (value === undefined) return undefined
  const u = amount.unit.toLowerCase()
  if (/^(s|sek|sekunden?|sec|seconds?)\.?$/.test(u)) return value
  if (/^(h|std|stunden?|hours?)\.?$/.test(u)) return value * 3600
  return value * 60
}
