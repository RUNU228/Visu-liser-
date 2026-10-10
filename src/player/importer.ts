import type { QueueModel, Track } from "./queue";
export const AUDIO_ACCEPT =
  ".mp3,.wav,.flac,.m4a,.aac,.ogg,.oga,.opus,.webm,audio/mpeg,audio/wav,audio/x-wav,audio/flac,audio/mp4,audio/aac,audio/ogg,audio/opus,audio/webm";
const MIME_HINTS: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  flac: "audio/flac",
  m4a: "audio/mp4",
  aac: "audio/aac",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  webm: "audio/webm",
};
export class LocalImporter {
  private probe = document.createElement("audio");
  private tasks: Track[] = [];
  private running = false;
  private token = 0;
  private abort: (() => void) | null = null;
  duplicates: File[] = [];
  urls = new Set<string>();
  constructor(
    private queue: QueueModel,
    private changed: () => void,
    private notice: (message: string) => void,
  ) {
    this.probe.preload = "metadata";
    this.probe.muted = true;
  }
  get pending() {
    return this.tasks.length + (this.running ? 1 : 0);
  }
  add(files: File[], again = false) {
    for (const file of files) {
      if (
        !again &&
        this.queue.rows.some(
          (row) =>
            row.file.name === file.name &&
            row.file.size === file.size &&
            row.file.lastModified === file.lastModified,
        )
      ) {
        this.duplicates.push(file);
        this.notice(
          `Возможный дубликат: ${file.name}. Можно добавить ещё раз.`,
        );
        continue;
      }
      if (this.queue.rows.length >= 100) {
        this.notice(`${file.name}: лимит очереди — 100 файлов.`);
        continue;
      }
      const row: Track = {
        id: crypto.randomUUID(),
        file,
        title: file.name.replace(/\.[^.]+$/, ""),
        url: "",
        duration: 0,
        status: "pending",
      };
      if (file.size > 250 * 1024 ** 2) {
        row.status = "failed";
        row.error = "Файл превышает 250 МиБ.";
      } else this.tasks.push(row);
      this.queue.add(row);
    }
    this.changed();
    void this.process();
  }
  retry(row: Track) {
    if (row.status !== "failed") return;
    if (row.file.size > 250 * 1024 ** 2) {
      this.notice("Файл превышает 250 МиБ.");
      return;
    }
    this.release(row.url);
    row.url = "";
    row.status = "pending";
    row.error = undefined;
    this.tasks.push(row);
    this.changed();
    void this.process();
  }
  private async process() {
    if (this.running) return;
    this.running = true;
    const token = this.token;
    while (this.tasks.length && token === this.token) {
      const row = this.tasks.shift()!;
      if (!this.queue.rows.includes(row)) continue;
      row.url = URL.createObjectURL(row.file);
      this.urls.add(row.url);
      try {
        row.duration = await this.prepare(row.url, row.file);
        if (token !== this.token || !this.queue.rows.includes(row)) {
          this.release(row.url);
          continue;
        }
        row.status = "ready";
        this.queue.available(row.id);
        this.changed();
      } catch (error) {
        if (token !== this.token || !this.queue.rows.includes(row)) {
          this.release(row.url);
          continue;
        }
        row.status = "failed";
        row.error =
          error instanceof Error ? error.message : "Не удалось открыть файл.";
        this.release(row.url);
        row.url = "";
        this.notice(`${row.file.name}: ${row.error}`);
        this.changed();
      }
    }
    this.running = false;
    this.changed();
    if (this.tasks.length) void this.process();
  }
  private prepare(url: string, file: File): Promise<number> {
    const hint =
      file.type || MIME_HINTS[file.name.split(".").at(-1)?.toLowerCase() ?? ""];
    if (hint) this.probe.canPlayType(hint); // Advisory only: actual loading is decisive.
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = (error?: Error) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        this.probe.removeEventListener("loadedmetadata", loaded);
        this.probe.removeEventListener("error", failed);
        this.probe.removeAttribute("src");
        this.probe.load();
        this.abort = null;
        if (error) reject(error);
        else resolve(duration);
      };
      let duration = 0;
      const loaded = () => {
        duration = this.probe.duration;
        if (!Number.isFinite(duration) || duration <= 0)
          finish(new Error("Длительность файла неизвестна или равна нулю."));
        else finish();
      };
      const failed = () =>
        finish(
          new Error(
            this.probe.error?.code === 3
              ? "Файл повреждён или не может быть декодирован."
              : "Браузер не смог открыть формат. Попробуйте MP3 или PCM WAV.",
          ),
        );
      const timer = setTimeout(
        () =>
          finish(new Error("Подготовка превысила 10 секунд. Можно повторить.")),
        10000,
      );
      this.abort = () => finish(new Error("Импорт отменён."));
      this.probe.addEventListener("loadedmetadata", loaded);
      this.probe.addEventListener("error", failed);
      this.probe.src = url;
      this.probe.load();
    });
  }
  cancel() {
    this.token++;
    this.tasks = [];
    this.abort?.();
    const pending = this.queue.rows.filter((t) => t.status === "pending");
    for (const row of pending) {
      this.queue.remove(row.id);
      this.release(row.url);
    }
    this.duplicates = [];
    this.changed();
  }
  release(url: string) {
    if (url && (this.probe.src === url || this.probe.currentSrc === url))
      this.abort?.();
    if (url && this.urls.delete(url)) URL.revokeObjectURL(url);
  }
  destroy() {
    this.cancel();
    this.probe.removeAttribute("src");
    this.probe.load();
    for (const url of this.urls) URL.revokeObjectURL(url);
    this.urls.clear();
  }
}
