// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Verwaltet Profil und Bereiche dieses Geräts und verbindet Datenmodell,
 * Verschlüsselung, lokale Ablage und Speicheranbieter
 * (plan/03-phase-1-einkaufsliste.md, 1.4–1.8).
 */

import * as Y from 'yjs'
import {
  type JoinReply,
  type Peer,
  type PersistedSyncState,
  type SpaceAccess,
  type SpaceKind,
  type StorageProvider,
  type SyncStateStore,
  DocSync,
  PollLoop,
  exportSpaceKey,
  generateSpaceKey,
  getMember,
  importSpaceKey,
  initSpace,
  listMembers,
  peerFiles,
  randomId,
  setMemberFile,
  spaceName,
  upsertMember,
} from '@/core'
import type { KeyValueStore } from './kv'

export interface Profile {
  deviceId: string
  person: string
  deviceName: string
  createdAt: number
}

export interface SpaceRecord {
  id: string
  kind: SpaceKind
  key: CryptoKey
  /** Dateien aus Einladung/Wiederherstellung, bis sie im Register stehen. */
  bootstrap: Peer[]
  createdAt: number
}

/** Hält ein Yjs-Dokument lokal fest (y-indexeddb); in Tests ein No-op. */
export type DocPersistence = (name: string, doc: Y.Doc) => Promise<{ destroy(): unknown }>

export interface WorkspaceDeps {
  kv: KeyValueStore
  provider: StorageProvider
  persistDoc: DocPersistence
  now?: () => number
  /** Abfrage-Intervalle (plan/01-architektur.md): 3 s in der Listenansicht, sonst 15 s. */
  intervals?: { active: number; idle: number }
  debounceMs?: number
}

export interface SpaceHandle {
  readonly record: SpaceRecord
  readonly doc: Y.Doc
  readonly sync: DocSync
  readonly loop: PollLoop
}

const K = {
  profile: 'profile',
  space: (id: string) => `space/${id}`,
  sync: (key: string) => `sync/${key}`,
}

class KvSyncStateStore implements SyncStateStore {
  constructor(private readonly kv: KeyValueStore) {}
  load(key: string) {
    return this.kv.get<PersistedSyncState>(K.sync(key))
  }
  save(key: string, state: PersistedSyncState) {
    return this.kv.set(K.sync(key), state)
  }
}

export class Workspace {
  private profileValue: Profile | undefined
  private records = new Map<string, SpaceRecord>()
  private readonly handles = new Map<string, Promise<SpaceHandle>>()
  private readonly persistence = new Map<string, { destroy(): unknown }>()
  private readonly syncStore: SyncStateStore
  private readonly now: () => number
  private visible = true

  private constructor(private readonly deps: WorkspaceDeps) {
    this.syncStore = new KvSyncStateStore(deps.kv)
    this.now = deps.now ?? Date.now
  }

  static async open(deps: WorkspaceDeps): Promise<Workspace> {
    const ws = new Workspace(deps)
    ws.profileValue = await deps.kv.get<Profile>(K.profile)
    for (const key of await deps.kv.keys('space/')) {
      const record = await deps.kv.get<SpaceRecord>(key)
      if (record) ws.records.set(record.id, record)
    }
    return ws
  }

  get profile(): Profile | undefined {
    return this.profileValue
  }

  get provider(): StorageProvider {
    return this.deps.provider
  }

  /** Erster Start: Profil anlegen und den persönlichen Bereich erzeugen. */
  async setup(person: string, deviceName: string): Promise<Profile> {
    if (this.profileValue) throw new Error('Profil existiert bereits')
    const profile: Profile = {
      deviceId: randomId(),
      person: person.trim(),
      deviceName: deviceName.trim(),
      createdAt: this.now(),
    }
    if (!profile.person) throw new Error('Name fehlt')
    await this.deps.kv.set(K.profile, profile)
    this.profileValue = profile
    await this.createSpace('Persönlich', 'personal')
    return profile
  }

  async updateProfile(patch: Partial<Pick<Profile, 'person' | 'deviceName'>>): Promise<void> {
    const profile = this.requireProfile()
    const next = { ...profile, ...patch }
    await this.deps.kv.set(K.profile, next)
    this.profileValue = next
    for (const id of this.records.keys()) {
      const handle = await this.space(id)
      this.registerSelf(handle.doc)
    }
  }

  private requireProfile(): Profile {
    if (!this.profileValue) throw new Error('Einrichtung fehlt')
    return this.profileValue
  }

  spaces(): SpaceRecord[] {
    return [...this.records.values()].sort((a, b) => a.createdAt - b.createdAt)
  }

  personalSpace(): SpaceRecord | undefined {
    return this.spaces().find((s) => s.kind === 'personal')
  }

  hasSpace(id: string): boolean {
    return this.records.has(id)
  }

  async createSpace(name: string, kind: SpaceKind): Promise<SpaceHandle> {
    this.requireProfile()
    const record: SpaceRecord = {
      id: randomId(),
      kind,
      key: await generateSpaceKey(),
      bootstrap: [],
      createdAt: this.now(),
    }
    await this.saveRecord(record)
    const handle = await this.space(record.id)
    initSpace(handle.doc, name.trim() || 'Ohne Namen', kind)
    this.registerSelf(handle.doc)
    return handle
  }

  private async saveRecord(record: SpaceRecord): Promise<void> {
    await this.deps.kv.set(K.space(record.id), record)
    this.records.set(record.id, record)
  }

  private registerSelf(doc: Y.Doc): void {
    const profile = this.requireProfile()
    const existing = getMember(doc, profile.deviceId)
    upsertMember(doc, {
      deviceId: profile.deviceId,
      person: profile.person,
      deviceName: profile.deviceName,
      provider: this.deps.provider.id,
      joinedAt: existing?.joinedAt ?? this.now(),
    })
  }

  /** Öffnet einen Bereich (einmal je Sitzung) samt lokaler Ablage, Sync und Abfrage. */
  space(id: string): Promise<SpaceHandle> {
    let handle = this.handles.get(id)
    if (!handle) {
      handle = this.openSpace(id)
      this.handles.set(id, handle)
      handle.catch(() => this.handles.delete(id))
    }
    return handle
  }

  private async openSpace(id: string): Promise<SpaceHandle> {
    const record = this.records.get(id)
    if (!record) throw new Error('unbekannter Bereich')
    const profile = this.requireProfile()
    const doc = new Y.Doc()
    this.persistence.set(id, await this.deps.persistDoc(`tafelrunde/${id}/live`, doc))

    const sync = new DocSync({
      doc,
      kind: 'live',
      spaceId: id,
      key: record.key,
      deviceId: profile.deviceId,
      provider: this.deps.provider,
      store: this.syncStore,
      ...(this.deps.debounceMs !== undefined ? { debounceMs: this.deps.debounceMs } : {}),
      now: this.now,
      peers: () => this.peersOf(id, doc),
      onOwnFile: (fileId) => {
        if (!getMember(doc, profile.deviceId)) this.registerSelf(doc)
        setMemberFile(doc, profile.deviceId, 'live', fileId)
      },
    })
    await sync.start()
    const intervals = this.deps.intervals ?? { active: 3000, idle: 15_000 }
    const loop = new PollLoop({
      poll: () => sync.poll(),
      intervalMs: intervals.idle,
      onUnexpectedError: (error) => console.error('Sync-Fehler', error),
    })
    loop.setVisible(this.visible)
    return { record, doc, sync, loop }
  }

  private peersOf(id: string, doc: Y.Doc): Peer[] {
    const self = this.profileValue?.deviceId ?? ''
    const known = peerFiles(doc, 'live', self)
    const record = this.records.get(id)
    const removed = new Set(
      listMembers(doc, { includeRemoved: true })
        .filter((m) => m.removedAt !== undefined)
        .map((m) => m.deviceId),
    )
    const extra = (record?.bootstrap ?? []).filter(
      (b) =>
        b.deviceId !== self &&
        !removed.has(b.deviceId) &&
        !known.some((k) => k.deviceId === b.deviceId),
    )
    return [...known, ...extra]
  }

  /** Abfragen nur, solange die App sichtbar ist (Page Visibility). */
  async setVisible(visible: boolean): Promise<void> {
    this.visible = visible
    for (const handle of this.handles.values()) (await handle).loop.setVisible(visible)
  }

  /** Startet Sync für alle Bereiche; `activeSpaceId` wird schneller abgefragt. */
  async startSync(activeSpaceId?: string): Promise<void> {
    const intervals = this.deps.intervals ?? { active: 3000, idle: 15_000 }
    for (const record of this.spaces()) {
      const handle = await this.space(record.id)
      handle.loop.setInterval(record.id === activeSpaceId ? intervals.active : intervals.idle)
      handle.loop.start()
    }
  }

  /** Nach dem Login: ausstehende Änderungen aller Bereiche schreiben. */
  async flushAll(): Promise<void> {
    for (const handle of this.handles.values()) await (await handle).sync.flush()
  }

  get hasPendingChanges(): Promise<boolean> {
    return Promise.all([...this.handles.values()]).then((hs) =>
      hs.some((h) => h.sync.hasPendingChanges),
    )
  }

  // --- Einladen, Beitreten, Wiederherstellen ------------------------------------

  private async accessFor(id: string, type: SpaceAccess['type']): Promise<SpaceAccess> {
    const handle = await this.space(id)
    const self = this.requireProfile().deviceId
    const peers = listMembers(handle.doc)
      .filter((m) => m.files.live)
      .map((m) => ({ deviceId: m.deviceId, provider: m.provider, files: m.files }))
    // Bei der Einladung genügt das eigene Gerät; der Rest steht im Register.
    const selected = type === 'invite' ? peers.filter((p) => p.deviceId === self) : peers
    return {
      type,
      spaceId: id,
      key: await exportSpaceKey(handle.record.key),
      name: spaceName(handle.doc),
      kind: handle.record.kind,
      peers: selected.length > 0 ? selected : peers.slice(0, 1),
    }
  }

  /**
   * Einladung für einen Bereich. Setzt voraus, dass dieses Gerät schon eine
   * eigene Datei geschrieben hat (sonst kann das neue Gerät nichts lesen).
   */
  async invite(id: string): Promise<SpaceAccess> {
    const access = await this.accessFor(id, 'invite')
    if (access.peers.length === 0)
      throw new Error('Noch nicht synchronisiert – bitte zuerst mit dem Speicher verbinden.')
    return access
  }

  async recoveryCode(id: string): Promise<SpaceAccess> {
    return this.accessFor(id, 'recovery')
  }

  /** Tritt einem Bereich bei (Einladung) oder stellt ihn wieder her. */
  async join(access: SpaceAccess): Promise<SpaceHandle> {
    this.requireProfile()
    const bootstrap: Peer[] = access.peers.flatMap((p) =>
      p.files.live ? [{ deviceId: p.deviceId, fileId: p.files.live }] : [],
    )
    const existing = this.records.get(access.spaceId)
    if (existing) {
      // Erneut beigetreten (z. B. nach Schlüsselwechsel): Schlüssel und Dateien übernehmen.
      const key = await importSpaceKey(access.key)
      await this.saveRecord({ ...existing, key, bootstrap })
      await this.closeSpace(access.spaceId)
    } else {
      await this.saveRecord({
        id: access.spaceId,
        kind: access.kind,
        key: await importSpaceKey(access.key),
        bootstrap,
        createdAt: this.now(),
      })
    }
    const handle = await this.space(access.spaceId)
    await handle.sync.poll().catch(() => undefined)
    this.registerSelf(handle.doc)
    return handle
  }

  /** Antwort-Code für das einladende Gerät; erst sinnvoll, wenn die eigene Datei existiert. */
  async reply(id: string): Promise<JoinReply> {
    const handle = await this.space(id)
    await handle.sync.flush()
    const profile = this.requireProfile()
    const fileId = handle.sync.ownFileId
    if (!fileId)
      throw new Error('Noch nicht synchronisiert – bitte zuerst mit dem Speicher verbinden.')
    return {
      type: 'reply',
      spaceId: id,
      deviceId: profile.deviceId,
      person: profile.person,
      deviceName: profile.deviceName,
      provider: this.deps.provider.id,
      files: { live: fileId },
    }
  }

  /** Nimmt ein neues Gerät nach dessen Antwort-Code ins Register auf. */
  async acceptReply(reply: JoinReply): Promise<SpaceHandle> {
    const handle = await this.space(reply.spaceId)
    const existing = getMember(handle.doc, reply.deviceId)
    if (existing?.removedAt !== undefined) throw new Error('Dieses Gerät wurde entfernt.')
    upsertMember(handle.doc, {
      deviceId: reply.deviceId,
      person: reply.person,
      deviceName: reply.deviceName,
      provider: reply.provider,
      joinedAt: existing?.joinedAt ?? this.now(),
      files: reply.files,
    })
    await handle.sync.poll().catch(() => undefined)
    return handle
  }

  private async closeSpace(id: string): Promise<void> {
    const handle = this.handles.get(id)
    if (!handle) return
    this.handles.delete(id)
    const h = await handle
    h.loop.stop()
    h.sync.stop()
    this.persistence.get(id)?.destroy()
    this.persistence.delete(id)
    h.doc.destroy()
  }

  async close(): Promise<void> {
    for (const id of [...this.handles.keys()]) await this.closeSpace(id)
  }
}
