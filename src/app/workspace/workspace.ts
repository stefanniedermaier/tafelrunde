// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Verwaltet Profil und Bereiche dieses Geräts und verbindet Datenmodell,
 * Verschlüsselung, lokale Ablage und Speicheranbieter
 * (plan/03-phase-1-einkaufsliste.md, 1.4–1.8).
 */

import * as Y from 'yjs'
import {
  type CatalogLookup,
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
  deleteList,
  exportList,
  getLinkedSpaces,
  importList,
  linkSpace,
  listMembers,
  markRemoved,
  reportLinkedFile,
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
  /** Frühere Schlüssel nach einem Wechsel, nur zum Lesen (neueste zuerst). */
  previousKeys?: CryptoKey[]
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

/** Höchstens drei alte Schlüssel behalten – genug für Geräte, die noch nicht gewechselt haben. */
function keepKeys(record: SpaceRecord): CryptoKey[] {
  return [record.key, ...(record.previousKeys ?? [])].slice(0, 3)
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
      previousKeys: record.previousKeys ?? [],
      deviceId: profile.deviceId,
      provider: this.deps.provider,
      store: this.syncStore,
      ...(this.deps.debounceMs !== undefined ? { debounceMs: this.deps.debounceMs } : {}),
      now: this.now,
      peers: () => this.peersOf(id, doc),
      onOwnFile: (fileId) => {
        // Auch den Anbieter aktualisieren (z. B. erst lokal, dann mit Google verbunden).
        this.registerSelf(doc)
        setMemberFile(doc, profile.deviceId, 'live', fileId)
        // Eigene Datei in verknüpften Bereichen dem Haushalt melden.
        if (record.kind === 'shared-list') this.scheduleLinkSync()
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
    // Haushalt: verknüpfte Bereiche (geteilte Listen) automatisch übernehmen.
    if (record.kind !== 'shared-list') doc.on('update', () => this.scheduleLinkSync())
    const records = this.records
    return {
      // Immer der aktuelle Datensatz (Schlüssel ändern sich beim Schlüsselwechsel).
      get record() {
        return records.get(id) ?? record
      },
      doc,
      sync,
      loop,
    }
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
    for (const record of this.spaces()) await (await this.space(record.id)).sync.flush()
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
      // Erneut beigetreten (z. B. nach Schlüsselwechsel): neuen Schlüssel übernehmen,
      // den alten nur noch zum Lesen behalten.
      const key = await importSpaceKey(access.key)
      const same = (await exportSpaceKey(existing.key)) === access.key
      const updated: SpaceRecord = {
        ...existing,
        key,
        previousKeys: same ? (existing.previousKeys ?? []) : keepKeys(existing),
        bootstrap,
      }
      await this.saveRecord(updated)
      const open = this.handles.get(access.spaceId)
      if (open) (await open).sync.setKeys(updated.key, updated.previousKeys ?? [])
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

  // --- Geteilte Listen (verknüpfte Bereiche) ------------------------------------

  /**
   * Überführt eine Liste in einen eigenen Bereich, den man mit Externen teilen
   * kann. Alle Geräte des bisherigen Bereichs treten automatisch bei.
   */
  async shareList(
    fromSpaceId: string,
    listId: string,
    lookup?: CatalogLookup,
  ): Promise<SpaceHandle> {
    const from = await this.space(fromSpaceId)
    const data = exportList(from.doc, listId, lookup)
    const target = await this.createSpace(data.name, 'shared-list')
    importList(target.doc, data, this.now())
    from.doc.transact(() => {
      deleteList(from.doc, listId)
    })
    linkSpace(from.doc, {
      spaceId: target.record.id,
      name: data.name,
      key: await exportSpaceKey(target.record.key),
    })
    await this.syncLinks()
    return target
  }

  private linkTimer: ReturnType<typeof setTimeout> | undefined
  private linkRun: Promise<void> | undefined

  private scheduleLinkSync(): void {
    clearTimeout(this.linkTimer)
    this.linkTimer = setTimeout(
      () => void this.syncLinks().catch((e: unknown) => console.error(e)),
      300,
    )
  }

  /** Tritt verknüpften Bereichen bei und gleicht die gemeldeten Dateien ab. */
  syncLinks(): Promise<void> {
    const run = async () => {
      const self = this.requireProfile().deviceId
      for (const record of this.spaces()) {
        if (record.kind === 'shared-list') continue
        const household = await this.space(record.id)
        for (const link of getLinkedSpaces(household.doc)) {
          if (!this.records.has(link.spaceId)) {
            await this.join({
              type: 'invite',
              spaceId: link.spaceId,
              key: link.key,
              name: link.name,
              kind: 'shared-list',
              peers: Object.entries(link.files)
                .filter(([deviceId]) => deviceId !== self)
                .map(([deviceId, fileId]) => ({ deviceId, provider: '', files: { live: fileId } })),
            })
            this.onSpacesChanged?.()
          }
          const shared = await this.space(link.spaceId)
          const own = shared.sync.ownFileId
          if (own) reportLinkedFile(household.doc, link.spaceId, self, own)
          for (const [deviceId, fileId] of Object.entries(link.files)) {
            if (deviceId === self) continue
            const member = getMember(shared.doc, deviceId)
            if (member?.removedAt !== undefined || member?.files.live === fileId) continue
            const info = getMember(household.doc, deviceId)
            upsertMember(shared.doc, {
              deviceId,
              person: info?.person ?? '',
              deviceName: info?.deviceName ?? '',
              provider: info?.provider ?? '',
              joinedAt: member?.joinedAt ?? this.now(),
              files: { live: fileId },
            })
          }
        }
      }
    }
    // Nie zwei Abgleiche gleichzeitig; ein angeforderter läuft nach dem aktuellen.
    const next = (this.linkRun ?? Promise.resolve()).then(run, run)
    this.linkRun = next.finally(() => {
      if (this.linkRun === next) this.linkRun = undefined
    })
    return next
  }

  /** Wird aufgerufen, wenn Bereiche ohne Zutun der Oberfläche hinzukommen. */
  onSpacesChanged: (() => void) | undefined

  /**
   * Entfernt ein Gerät und wechselt den Schlüssel (plan/01-architektur.md,
   * „Entfernen und Schlüsselwechsel“). Ab sofort wird mit dem neuen
   * Schlüssel geschrieben; die verbleibenden Geräte übernehmen ihn über
   * `invite()` (Schlüssel-Code). Was das entfernte Gerät schon gesehen hat,
   * bleibt ihm bekannt.
   */
  async removeDevice(spaceId: string, deviceId: string): Promise<SpaceHandle> {
    const profile = this.requireProfile()
    if (deviceId === profile.deviceId)
      throw new Error('Dieses Gerät kann sich nicht selbst entfernen.')
    const before = await this.space(spaceId)
    markRemoved(before.doc, deviceId, this.now())
    const record = this.records.get(spaceId)!
    const updated: SpaceRecord = {
      ...record,
      key: await generateSpaceKey(),
      previousKeys: keepKeys(record),
      bootstrap: record.bootstrap.filter((b) => b.deviceId !== deviceId),
    }
    await this.saveRecord(updated)
    before.sync.setKeys(updated.key, updated.previousKeys ?? [])
    await before.sync.flush()
    return before
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
