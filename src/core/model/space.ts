// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Bereich und Mitglieder-Register im Dokument `live`
 * (siehe plan/01-architektur.md, „Datenmodell“).
 *
 * Mitglieder sind Geräte. Jeder Eintrag ist eine eigene `Y.Map`, damit
 * gleichzeitige Änderungen an verschiedenen Feldern (z. B. Gerätename und
 * Datei-IDs) zusammengeführt werden statt sich zu überschreiben.
 */

import * as Y from 'yjs'
import type { DocKind } from '../crypto/envelope'
import { isValidId } from '../crypto/ids'

export type SpaceKind = 'personal' | 'household' | 'shared-list'

export interface FileRefs {
  live?: string
  library?: string
}

export interface Member {
  deviceId: string
  person: string
  deviceName: string
  provider: string
  files: FileRefs
  joinedAt: number
  removedAt?: number
}

export const LIVE_ROOT = {
  meta: 'meta',
  members: 'members',
  lists: 'lists',
  items: 'items',
  categoryOverrides: 'categoryOverrides',
} as const

export function membersMap(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return doc.getMap(LIVE_ROOT.members)
}

export function initSpace(doc: Y.Doc, name: string, kind: SpaceKind): void {
  const meta = doc.getMap<unknown>(LIVE_ROOT.meta)
  doc.transact(() => {
    if (!meta.has('name')) meta.set('name', name)
    if (!meta.has('kind')) meta.set('kind', kind)
  })
}

export function spaceName(doc: Y.Doc): string {
  const name = doc.getMap<unknown>(LIVE_ROOT.meta).get('name')
  return typeof name === 'string' ? name : ''
}

export function spaceKind(doc: Y.Doc): SpaceKind | undefined {
  const kind = doc.getMap<unknown>(LIVE_ROOT.meta).get('kind')
  return kind === 'personal' || kind === 'household' || kind === 'shared-list' ? kind : undefined
}

export function renameSpace(doc: Y.Doc, name: string): void {
  doc.getMap<unknown>(LIVE_ROOT.meta).set('name', name.trim())
}

export function upsertMember(
  doc: Y.Doc,
  member: Omit<Member, 'files'> & { files?: FileRefs },
): void {
  if (!isValidId(member.deviceId)) throw new Error('ungültige Geräte-ID')
  const members = membersMap(doc)
  doc.transact(() => {
    let entry = members.get(member.deviceId)
    if (!entry) {
      entry = new Y.Map<unknown>()
      members.set(member.deviceId, entry)
    }
    entry.set('person', member.person)
    entry.set('deviceName', member.deviceName)
    entry.set('provider', member.provider)
    if (!entry.has('joinedAt')) entry.set('joinedAt', member.joinedAt)
    for (const [kind, fileId] of Object.entries(member.files ?? {})) {
      if (fileId) entry.set(`file:${kind}`, fileId)
    }
  })
}

export function setMemberFile(doc: Y.Doc, deviceId: string, kind: DocKind, fileId: string): void {
  const entry = membersMap(doc).get(deviceId)
  if (!entry) throw new Error('unbekanntes Gerät')
  if (entry.get(`file:${kind}`) !== fileId) entry.set(`file:${kind}`, fileId)
}

export function renameDevice(doc: Y.Doc, deviceId: string, deviceName: string): void {
  membersMap(doc).get(deviceId)?.set('deviceName', deviceName.trim())
}

/** Ein entferntes Gerät bleibt als Grabstein im Register, damit es nicht wieder auftaucht. */
export function markRemoved(doc: Y.Doc, deviceId: string, at: number): void {
  membersMap(doc).get(deviceId)?.set('removedAt', at)
}

function readMember(deviceId: string, entry: Y.Map<unknown>): Member | undefined {
  const str = (k: string) => {
    const v = entry.get(k)
    return typeof v === 'string' ? v : undefined
  }
  const num = (k: string) => {
    const v = entry.get(k)
    return typeof v === 'number' ? v : undefined
  }
  const files: FileRefs = {}
  const live = str('file:live')
  const library = str('file:library')
  if (live) files.live = live
  if (library) files.library = library
  const member: Member = {
    deviceId,
    person: str('person') ?? '',
    deviceName: str('deviceName') ?? '',
    provider: str('provider') ?? '',
    files,
    joinedAt: num('joinedAt') ?? 0,
  }
  const removedAt = num('removedAt')
  if (removedAt !== undefined) member.removedAt = removedAt
  return isValidId(deviceId) ? member : undefined
}

export function listMembers(doc: Y.Doc, { includeRemoved = false } = {}): Member[] {
  const out: Member[] = []
  membersMap(doc).forEach((entry, deviceId) => {
    if (!(entry instanceof Y.Map)) return
    const m = readMember(deviceId, entry)
    if (m && (includeRemoved || m.removedAt === undefined)) out.push(m)
  })
  return out.sort((a, b) => a.joinedAt - b.joinedAt || a.deviceId.localeCompare(b.deviceId))
}

/** Dateien der anderen, nicht entfernten Geräte für ein Dokument – Eingabe für den Sync. */
export function peerFiles(
  doc: Y.Doc,
  kind: DocKind,
  selfId: string,
): { deviceId: string; fileId: string }[] {
  return listMembers(doc).flatMap((m) => {
    const fileId = m.files[kind]
    return m.deviceId !== selfId && fileId ? [{ deviceId: m.deviceId, fileId }] : []
  })
}

export function getMember(doc: Y.Doc, deviceId: string): Member | undefined {
  const entry = membersMap(doc).get(deviceId)
  return entry instanceof Y.Map ? readMember(deviceId, entry) : undefined
}
