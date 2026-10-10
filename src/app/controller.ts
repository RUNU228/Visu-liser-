import { AudioEngine } from "../audio/engine";
import { QueueModel, type QueueSnapshot } from "../player/queue";
import { LocalImporter } from "../player/importer";
import { SettingsStorage, type UserPreset } from "../settings/storage";
import { defaults, validateSettings } from "../settings/schema";
import type { Settings } from "../shared/types";
export class AppController {
  readonly queue = new QueueModel();
  readonly importer: LocalImporter;
  readonly audio: AudioEngine;
  readonly storage: SettingsStorage;
  settings: Settings;
  presets: UserPreset[];
  message = "";
  version = 0;
  listeners = new Set<() => void>();
  undo: { snapshot: QueueSnapshot; position: number; deadline: number } | null =
    null;
  private undoTimer: ReturnType<typeof setTimeout> | null = null;
  private suppress = false;
  constructor() {
    this.storage = new SettingsStorage((text) => this.notify(text));
    const persisted = this.storage.load();
    this.settings = persisted.settings;
    this.presets = persisted.presets;
    this.audio = new AudioEngine(
      this.settings,
      () => this.emit(),
      (text) => this.notify(text),
      () => this.advance(true),
      () => this.failure(),
    );
    this.importer = new LocalImporter(
      this.queue,
      () => {
        if (
          !this.suppress &&
          !this.queue.activeId &&
          this.queue.playable.length
        ) {
          this.queue.select(this.queue.playable[0].id);
          void this.audio.load(this.queue.active!.url);
        }
        this.emit();
      },
      (text) => this.notify(text),
    );
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  snapshot = () => this.version;
  emit() {
    this.version++;
    this.listeners.forEach((listener) => listener());
  }
  notify(text: string) {
    if (this.message === text) return;
    this.message = text;
    this.emit();
  }
  setSettings(input: unknown) {
    try {
      const settings = validateSettings(input);
      this.audio.configure(settings);
      this.settings = settings;
      this.storage.save(settings, this.presets);
      this.emit();
    } catch (error) {
      this.notify(
        error instanceof Error ? error.message : "Неверные настройки.",
      );
    }
  }
  resetSettings() {
    this.setSettings(defaults());
  }
  savePreset(name: string) {
    name = name.trim().slice(0, 80);
    if (!name) return;
    this.presets.push({
      id: crypto.randomUUID(),
      name,
      settings: structuredClone(this.settings),
    });
    const saved = this.storage.save(this.settings, this.presets);
    if (saved) this.notify(`Пресет «${name}» сохранён.`);
    this.emit();
  }
  renamePreset(id: string, name: string) {
    const preset = this.presets.find((p) => p.id === id);
    if (preset && name.trim()) {
      preset.name = name.trim().slice(0, 80);
      this.storage.save(this.settings, this.presets);
      this.emit();
    }
  }
  deletePreset(id: string) {
    this.presets = this.presets.filter((p) => p.id !== id);
    this.storage.save(this.settings, this.presets);
    this.emit();
  }
  add(files: File[], again = false) {
    this.finalizeUndo();
    this.importer.add(files, again);
  }
  select(id: string) {
    const selected = this.queue.select(id);
    if (selected) void this.audio.load(this.queue.active!.url);
    this.emit();
  }
  togglePlay() {
    if (this.audio.intent && this.audio.state !== "interrupted")
      this.audio.pause();
    else void this.audio.play();
  }
  advance(automatic = false) {
    const id = this.queue.next(automatic);
    if (id) {
      void this.audio.load(this.queue.active!.url);
    } else if (automatic) {
      this.audio.intent = false;
      this.audio.state = "ended";
    }
    this.emit();
  }
  previous() {
    const id = this.queue.previous(this.audio.media.currentTime);
    if (id === this.queue.activeId && this.audio.media.currentTime > 3)
      void this.audio.seek(0);
    else if (id) {
      const row = this.queue.rows.find((t) => t.id === id)!;
      void this.audio.load(row.url);
    }
    this.emit();
  }
  private failure() {
    const active = this.queue.active;
    if (!active) return;
    this.queue.fail(active.id);
    const next = this.queue.next(true) ?? this.queue.playable[0]?.id;
    if (next) {
      this.queue.select(next);
      void this.audio.load(this.queue.active!.url);
    } else {
      this.audio.intent = false;
      this.audio.pause();
      this.queue.activeId = null;
      this.notify(
        "В очереди нет доступных дорожек. Повторите подготовку или добавьте другие файлы.",
      );
    }
    this.emit();
  }
  async remove(id: string) {
    const row = this.queue.rows.find((t) => t.id === id);
    if (!row) return;
    const wasActive = this.queue.activeId === id;
    this.queue.remove(id);
    if (wasActive) {
      if (this.queue.active) await this.audio.load(this.queue.active.url);
      else this.audio.detach();
    }
    this.importer.release(row.url);
    this.emit();
  }
  clear() {
    this.finalizeUndo();
    this.suppress = true;
    this.importer.cancel();
    const snapshot = this.queue.snapshot();
    const position = this.audio.media.currentTime;
    this.queue.clear();
    this.audio.detach();
    this.suppress = false;
    if (snapshot.rows.length) {
      this.undo = { snapshot, position, deadline: Date.now() + 5000 };
      this.undoTimer = setTimeout(() => this.finalizeUndo(), 5000);
    }
    this.emit();
  }
  restoreUndo() {
    if (!this.undo || Date.now() > this.undo.deadline) {
      this.finalizeUndo();
      return;
    }
    const undo = this.undo;
    if (this.undoTimer) clearTimeout(this.undoTimer);
    this.undoTimer = null;
    this.undo = null;
    this.queue.restore(undo.snapshot);
    this.audio.intent = false;
    if (this.queue.active)
      void this.audio.load(this.queue.active.url, undo.position);
    this.emit();
  }
  finalizeUndo() {
    if (this.undoTimer) clearTimeout(this.undoTimer);
    this.undoTimer = null;
    if (this.undo)
      for (const row of this.undo.snapshot.rows)
        if (!this.queue.rows.some((t) => t.url === row.url))
          this.importer.release(row.url);
    this.undo = null;
    this.emit();
  }
  destroy() {
    this.finalizeUndo();
    this.audio.destroy();
    this.importer.destroy();
    this.listeners.clear();
  }
}
