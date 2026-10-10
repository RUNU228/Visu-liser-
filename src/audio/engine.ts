import tapUrl from "./worklets/tap.js?url";
import {
  MODULES,
  type Settings,
  type ModuleId,
  type PCMPacket,
  type WorkerOutput,
  type AnalysisConfig,
  type AnalysisResult,
} from "../shared/types";
import { reserveAnalysis } from "../settings/schema";
import { AnalysisStore } from "../visualizers/store";
import { captureEligible, matchesBoundary } from "./capture";
export type TransportState =
  | "empty"
  | "ready"
  | "playing"
  | "paused"
  | "buffering"
  | "interrupted"
  | "ended"
  | "error";
export class AudioEngine {
  readonly media = document.createElement("audio");
  context: AudioContext | undefined;
  state: TransportState = "empty";
  intent = false;
  frozen = false;
  volume = 1;
  muted = false;
  rate = 1;
  store: AnalysisStore;
  private source: MediaElementAudioSourceNode | undefined;
  private gain: GainNode | undefined;
  private tap: AudioWorkletNode | undefined;
  private worker: Worker | undefined;
  private analyser: AnalyserNode | undefined;
  private initialization: Promise<void> | null = null;
  private playing = false;
  private buffering = false;
  private capturing = false;
  private opening = false;
  private gateId = 0;
  private operation = 0;
  private sessionId = 1;
  private epoch = 0;
  private anchorFrame = 0;
  private anchorVisual = 0;
  private lastCaptureFrame = 0;
  private boundaryWaiters = new Map<
    number,
    {
      resolve: (frame: number) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private workletRetry = false;
  private workerRetry = false;
  private recovering = false;
  private readyWorker = false;
  private lastWorkerResult = 0;
  private lastPCM = 0;
  private watchdog: ReturnType<typeof setInterval>;
  private cleanups: (() => void)[] = [];
  private expectedUrl = "";
  private destroyed = false;
  private fallbackTimer: ReturnType<typeof setInterval> | undefined;
  private fallbackTime = 0;
  private closing: Promise<void> | null = null;
  private gateGeneration = 0;
  private playRequest = 0;
  private rateRequest = 0;
  private pcmOwners = new Map<Worker, AudioWorkletNode[]>();
  private workerHandshakeCancel: (() => void) | null = null;
  private pendingTapCancel: (() => void) | null = null;
  private tapCleanup: (() => void) | null = null;
  constructor(
    settings: Settings,
    private changed: () => void,
    private notice: (message: string) => void,
    private ended: () => void,
    private failed: () => void,
  ) {
    this.store = new AnalysisStore(settings);
    this.media.preload = "auto";
    this.media.volume = 1;
    this.media.muted = false;
    this.media.preservesPitch = true;
    const listen = (name: string, fn: () => void) => {
      this.media.addEventListener(name, fn);
      this.cleanups.push(() => this.media.removeEventListener(name, fn));
    };
    listen("playing", () => {
      if (
        !this.currentMedia() ||
        this.media.paused ||
        this.media.seeking ||
        this.media.readyState < 2
      )
        return;
      this.playing = true;
      this.buffering = false;
      if (this.intent) {
        this.state =
          this.context && this.context.state !== "running"
            ? "interrupted"
            : "playing";
        void this.updateGate();
      }
      this.changed();
    });
    listen("waiting", () => {
      if (
        !this.currentMedia() ||
        !this.intent ||
        this.media.paused ||
        this.media.readyState >= 3
      )
        return;
      this.playing = false;
      this.buffering = true;
      this.state = "buffering";
      void this.closeGate();
      this.changed();
    });
    listen("pause", () => {
      if (!this.currentMedia() || !this.media.paused) return;
      this.playing = false;
      void this.closeGate();
      if (!this.intent && this.state !== "empty" && this.state !== "ended")
        this.state = "paused";
      this.changed();
    });
    listen("ended", () => {
      if (!this.currentMedia() || !this.media.ended || this.media.seeking)
        return;
      this.playing = false;
      void this.closeGate();
      this.state = "ended";
      this.changed();
      this.ended();
    });
    listen("seeking", () => {
      if (!this.currentMedia() || !this.media.seeking) return;
      this.playing = false;
      void this.closeGate();
    });
    listen("seeked", () => {
      if (!this.currentMedia() || this.media.seeking) return;
      if (
        this.intent &&
        !this.media.paused &&
        this.media.readyState >= 2 &&
        !this.buffering
      ) {
        this.playing = true;
        this.state = "playing";
        void this.updateGate();
      }
      this.changed();
    });
    listen("timeupdate", () => this.changed());
    listen("error", () => {
      if (!this.expectedUrl || this.media.currentSrc !== this.expectedUrl)
        return;
      this.playing = false;
      void this.closeGate();
      this.state = "error";
      this.notice(
        "Не удалось декодировать дорожку. Файл исключён из автоматического воспроизведения.",
      );
      this.failed();
      this.changed();
    });
    const visibility = () => {
      if (document.hidden) {
        void this.closeGate();
      } else {
        this.store.clear();
        void this.updateGate();
      }
      this.changed();
    };
    document.addEventListener("visibilitychange", visibility);
    this.cleanups.push(() =>
      document.removeEventListener("visibilitychange", visibility),
    );
    this.watchdog = setInterval(() => {
      if (!this.capturing || !this.context || !this.eligible()) return;
      this.worker?.postMessage({
        type: "tick",
        currentFrame: Math.round(
          this.context.currentTime * this.context.sampleRate,
        ),
      });
      const window =
        Math.max(
          this.store.settings.spectrum.fftSize,
          this.store.settings.spectrogram.fftSize,
        ) / this.context.sampleRate;
      const deadline = Math.max(1000, window * 2000);
      const outstanding =
        this.worker && (this.pcmOwners.get(this.worker)?.length ?? 0) > 0;
      if (
        (performance.now() - this.lastPCM < 250 || outstanding) &&
        performance.now() - this.lastWorkerResult > deadline
      )
        void this.recoverWorker("Анализ не отвечает.");
    }, 200);
  }
  private ensureGraph() {
    if (this.initialization) return this.initialization;
    this.context = new AudioContext();
    const context = this.context;
    this.source = context.createMediaElementSource(this.media);
    this.gain = context.createGain();
    this.gain.channelCount = 2;
    this.gain.channelCountMode = "explicit";
    this.gain.channelInterpretation = "speakers";
    this.gain.connect(context.destination);
    this.setVolume(this.volume, this.muted);
    // Start through bypass; switch a single route only after the worklet handshake.
    this.source.connect(this.gain);
    this.analyser = context.createAnalyser();
    this.analyser.channelCount = 2;
    this.analyser.channelCountMode = "explicit";
    this.analyser.channelInterpretation = "speakers";
    this.source.connect(this.analyser);
    const statechange = () => {
      if (context.state !== "running") {
        this.finishBoundaries(this.lastCaptureFrame);
        void this.closeGate();
        if (this.intent) {
          this.state = "interrupted";
          this.notice("Аудио прервано. Нажмите «Продолжить».");
        }
      } else {
        this.lastWorkerResult = performance.now();
        if (
          this.intent &&
          !this.media.paused &&
          this.media.readyState >= 2 &&
          !this.buffering
        ) {
          this.playing = true;
          this.state = "playing";
        }
        void this.updateGate();
      }
      this.changed();
    };
    context.addEventListener("statechange", statechange);
    this.cleanups.push(() =>
      context.removeEventListener("statechange", statechange),
    );
    this.initialization = (async () => {
      await this.startWorker();
      try {
        await context.audioWorklet.addModule(tapUrl);
        await this.installTap();
      } catch {
        this.fallback(
          "AudioWorklet недоступен. Используется ограниченный анализ AnalyserNode.",
        );
      }
    })().catch(() =>
      this.fallback("Worker недоступен. Используется ограниченный анализ."),
    );
    return this.initialization;
  }
  private startWorker(): Promise<void> {
    this.stopWorker();
    this.readyWorker = false;
    const worker = new Worker(
      new URL("../analysis/worker.ts", import.meta.url),
      { type: "module" },
    );
    this.worker = worker;
    this.pcmOwners.set(worker, []);
    return new Promise((resolve, reject) => {
      let ready = false;
      const cancel = () => {
        clearTimeout(timeout);
        if (this.workerHandshakeCancel === cancel)
          this.workerHandshakeCancel = null;
        reject(new Error("Worker handshake cancelled"));
      };
      const timeout = setTimeout(cancel, 2000);
      this.workerHandshakeCancel = cancel;
      const failed = (reason: string) => {
        if (this.worker !== worker) return;
        clearTimeout(timeout);
        if (!ready) {
          cancel();
        } else void this.recoverWorker(reason);
      };
      worker.onerror = () => failed("Ошибка Worker.");
      worker.onmessageerror = () => failed("Ошибка передачи данных анализа.");
      worker.onmessage = (event: MessageEvent<WorkerOutput>) => {
        const message = event.data;
        if (this.worker !== worker) return;
        if (message.type === "ready") {
          ready = true;
          clearTimeout(timeout);
          if (this.workerHandshakeCancel === cancel)
            this.workerHandshakeCancel = null;
          this.readyWorker = true;
          this.configureWorker();
          this.lastWorkerResult = performance.now();
          resolve();
        } else if (message.type === "recycle") {
          const owner = this.pcmOwners.get(worker)?.shift();
          if (owner && owner === this.tap)
            owner.port.postMessage(
              { type: "recycle", buffer: message.buffer },
              [message.buffer],
            );
        } else if (message.type === "result") {
          this.lastWorkerResult = performance.now();
          if (
            this.capturing &&
            matchesBoundary(message, this.sessionId, this.epoch)
          ) {
            this.store.accept(message);
            this.store.error = "";
          }
          worker.postMessage({ type: "credit", count: 1 });
        }
      };
    });
  }
  private installTap(): Promise<void> {
    if (this.destroyed) return Promise.reject(new Error("Engine destroyed"));
    const context = this.context!;
    const node = new AudioWorkletNode(context, "visualizer-stereo-tap", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 2,
      channelCountMode: "explicit",
      channelInterpretation: "speakers",
      outputChannelCount: [2],
    });
    return new Promise((resolve, reject) => {
      let ready = false,
        cancelled = false;
      const cancel = () => {
        if (cancelled) return;
        cancelled = true;
        clearTimeout(timeout);
        node.removeEventListener("processorerror", processorError);
        node.disconnect();
        node.port.close();
        if (this.pendingTapCancel === cancel) this.pendingTapCancel = null;
        reject(new Error("Worklet handshake cancelled"));
      };
      const timeout = setTimeout(cancel, 2000);
      const processorError = () => {
        if (!ready) cancel();
        else if (node === this.tap)
          void this.recoverWorklet("Ошибка аудиопроцессора.");
      };
      this.pendingTapCancel = cancel;
      node.addEventListener("processorerror", processorError);
      node.port.onmessage = ({ data }) => {
        if (cancelled) return;
        if (this.destroyed) {
          cancel();
          return;
        }
        if (data.type === "ready" && !ready) {
          ready = true;
          clearTimeout(timeout);
          if (this.pendingTapCancel === cancel) this.pendingTapCancel = null;
          this.source!.disconnect();
          this.tapCleanup?.();
          this.tap?.disconnect();
          this.tap?.port.close();
          this.tap = node;
          this.tapCleanup = () =>
            node.removeEventListener("processorerror", processorError);
          this.source!.connect(node);
          node.connect(this.gain!);
          node.connect(this.analyser!);
          this.store.fallback = false;
          this.stopFallback();
          this.sessionId++;
          this.capturing = false;
          this.opening = false;
          this.gateGeneration++;
          this.store.clear();
          resolve();
        } else if (data.type === "protocolerror")
          void this.recoverWorklet(
            "Переполнена очередь границ аудиопроцессора.",
          );
        else if (data.type === "boundary") {
          const waiter = this.boundaryWaiters.get(data.id);
          if (waiter) {
            clearTimeout(waiter.timer);
            this.boundaryWaiters.delete(data.id);
            waiter.resolve(data.frame);
          }
        } else if (data.type === "pcm") {
          const packet = data as PCMPacket;
          if (
            node === this.tap &&
            this.capturing &&
            this.readyWorker &&
            matchesBoundary(packet, this.sessionId, this.epoch)
          ) {
            const currentFrame = context.currentTime * context.sampleRate;
            if (
              currentFrame -
                (packet.firstSampleIndex + packet.sampleFrameCount) >
              context.sampleRate * 0.1
            ) {
              node.port.postMessage(
                { type: "recycle", buffer: packet.buffer },
                [packet.buffer],
              );
              return;
            }
            packet.visualStart =
              this.anchorVisual +
              (packet.firstSampleIndex - this.anchorFrame) / packet.sampleRate;
            this.lastCaptureFrame =
              packet.firstSampleIndex + packet.sampleFrameCount;
            this.lastPCM = performance.now();
            this.pcmOwners.get(this.worker!)!.push(node);
            this.worker!.postMessage(packet, [packet.buffer]);
          } else if (node === this.tap)
            node.port.postMessage({ type: "recycle", buffer: packet.buffer }, [
              packet.buffer,
            ]);
        }
      };
      const buffers = Array.from(
        { length: 12 },
        () => new ArrayBuffer(1024 * 2 * 4),
      );
      node.port.postMessage({ type: "pool", buffers }, buffers);
    });
  }
  private boundary(open: boolean): Promise<number> {
    const tap = this.tap;
    if (!tap)
      return Promise.resolve(
        Math.round(
          (this.context?.currentTime ?? 0) *
            (this.context?.sampleRate ?? 48000),
        ),
      );
    const id = ++this.gateId;
    const message = {
      type: "gate",
      open,
      id,
      sessionId: this.sessionId,
      captureEpoch: this.epoch,
    };
    if (this.context?.state !== "running") {
      tap.port.postMessage(message);
      return Promise.resolve(this.lastCaptureFrame);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.boundaryWaiters.delete(id);
        if (this.context?.state !== "running") {
          resolve(this.lastCaptureFrame);
          return;
        }
        reject(new Error("Boundary acknowledgement timeout"));
        void this.recoverWorklet("Аудиопроцессор не подтвердил границу.");
      }, 250);
      this.boundaryWaiters.set(id, { resolve, reject, timer });
      tap.port.postMessage(message);
    });
  }
  private currentMedia() {
    return !!this.expectedUrl && this.media.currentSrc === this.expectedUrl;
  }
  private finishBoundaries(frame: number) {
    for (const waiter of this.boundaryWaiters.values()) {
      clearTimeout(waiter.timer);
      waiter.resolve(frame);
    }
    this.boundaryWaiters.clear();
  }
  private stopWorker() {
    const worker = this.worker;
    if (!worker) return;
    this.workerHandshakeCancel?.();
    worker.terminate();
    const owners = this.pcmOwners.get(worker) ?? [];
    const count = owners.filter((owner) => owner === this.tap).length;
    if (count && this.tap) {
      const buffers = Array.from(
        { length: count },
        () => new ArrayBuffer(8192),
      );
      this.tap.port.postMessage({ type: "pool", buffers }, buffers);
    }
    this.pcmOwners.delete(worker);
    this.worker = undefined;
    this.readyWorker = false;
  }
  private eligible() {
    return captureEligible({
      intent: this.intent,
      playing: this.playing && !this.media.paused && this.media.readyState >= 2,
      seeking: this.media.seeking,
      context: this.context?.state ?? "",
      visible: !document.hidden,
      frozen: this.frozen,
      enabled: MODULES.some((id) => this.store.settings.layout.enabled[id]),
      primary:
        !!this.tap &&
        this.readyWorker &&
        !this.store.fallback &&
        !this.recovering &&
        !this.destroyed,
    });
  }
  private closeGate(): Promise<void> {
    const was = this.capturing || this.opening;
    this.capturing = false;
    this.opening = false;
    this.gateGeneration++;
    if (this.closing) return this.closing;
    if (!was) return Promise.resolve();
    const session = this.sessionId;
    const closing = (async () => {
      try {
        const frame = await this.boundary(false);
        if (session === this.sessionId) {
          if (frame >= this.anchorFrame)
            this.anchorVisual +=
              (frame - this.anchorFrame) / (this.context?.sampleRate ?? 48000);
          this.anchorFrame = frame;
        }
      } catch {
        /* Recovery takes ownership of the closed gate. */
      }
    })();
    this.closing = closing;
    void closing.finally(() => {
      if (this.closing === closing) this.closing = null;
    });
    return closing;
  }
  private async updateGate() {
    if (!this.eligible()) {
      await this.closeGate();
      return;
    }
    if (this.closing) await this.closing;
    if (!this.eligible() || this.capturing || this.opening) return;
    this.opening = true;
    const operation = this.operation,
      generation = ++this.gateGeneration;
    this.epoch++;
    this.worker?.postMessage({
      type: "reset",
      sessionId: this.sessionId,
      captureEpoch: this.epoch,
    });
    try {
      const frame = await this.boundary(true);
      if (generation !== this.gateGeneration) return;
      if (operation !== this.operation || !this.eligible()) {
        await this.closeGate();
        return;
      }
      this.anchorFrame = frame;
      this.anchorVisual = Math.max(this.anchorVisual, this.store.time);
      this.store.maps.push({
        time: this.anchorVisual,
        frame,
        media: this.media.currentTime,
        rate: this.rate,
        sampleRate: this.context!.sampleRate,
      });
      if (this.store.maps.length > 1000) this.store.maps.shift();
      this.lastWorkerResult = performance.now();
      this.capturing = true;
      this.opening = false;
    } catch {
      if (generation === this.gateGeneration) this.opening = false;
    }
  }
  private configureWorker() {
    if (!this.worker || !this.context) return;
    const reservation = reserveAnalysis(
      this.store.settings,
      this.context.sampleRate,
    );
    const config: AnalysisConfig = {
      settings: this.store.settings,
      revisions: this.store.revisions,
      mobile:
        innerWidth < 768 ||
        matchMedia("(pointer: coarse)").matches ||
        this.store.settings.performance.economy,
      buckets: reservation.buckets,
    };
    this.worker.postMessage({ type: "config", config });
    this.lastWorkerResult = performance.now();
  }
  configure(settings: Settings) {
    const previous = this.store.settings;
    const changed = (id: ModuleId, keys: string[]) =>
      keys.some(
        (key) =>
          (previous[id] as unknown as Record<string, unknown>)[key] !==
          (settings[id] as unknown as Record<string, unknown>)[key],
      );
    for (const id of MODULES) {
      let numerical =
        !previous.layout.enabled[id] && settings.layout.enabled[id];
      if (id === "spectrogram" || id === "spectrum")
        numerical ||= changed(id, ["fftSize", "window", "channel"]);
      if (id === "spectrum") numerical ||= changed(id, ["smoothing", "peaks"]);
      if (id === "waveform")
        numerical ||= changed(id, ["style", "bandHistory"]);
      if (id === "stereometer") numerical ||= changed(id, ["bands"]);
      if (id === "oscilloscope")
        numerical ||= changed(id, [
          "channel",
          "mode",
          "trigger",
          "level",
          "cycles",
          "windowMs",
        ]);
      if (numerical) {
        this.store.revisions[id]++;
        this.store.clear(id);
      }
    }
    this.store.settings = settings;
    this.configureWorker();
    void this.updateGate();
    this.changed();
  }
  async load(url: string, position = 0) {
    const operation = ++this.operation;
    await this.closeGate();
    if (operation !== this.operation) return;
    this.playing = false;
    this.buffering = false;
    this.sessionId++;
    this.anchorVisual = 0;
    this.anchorFrame = 0;
    this.store.clear();
    this.expectedUrl = url;
    this.media.pause();
    this.media.src = url;
    this.media.playbackRate = this.rate;
    this.media.load();
    this.state = "ready";
    this.changed();
    if (position > 0)
      await this.waitMedia("loadedmetadata", operation)
        .then(() => {
          if (operation === this.operation)
            this.media.currentTime = Math.min(
              position,
              this.media.duration || position,
            );
        })
        .catch(() => {});
    if (operation === this.operation && this.intent) await this.play();
  }
  private waitMedia(event: string, operation: number) {
    return new Promise<void>((resolve, reject) => {
      if (event === "loadedmetadata" && this.media.readyState >= 1) {
        resolve();
        return;
      }
      const done = () => {
        clearTimeout(timer);
        this.media.removeEventListener(event, onEvent);
        resolve();
      };
      const onEvent = () => {
        if (operation === this.operation) done();
      };
      const timer = setTimeout(() => {
        this.media.removeEventListener(event, onEvent);
        reject(new Error("Media timeout"));
      }, 10000);
      this.media.addEventListener(event, onEvent);
    });
  }
  async play() {
    if (!this.expectedUrl) return;
    this.intent = true;
    const request = ++this.playRequest;
    const initialization = this.ensureGraph();
    const operation = this.operation;
    const resumed = this.context!.resume();
    try {
      await resumed;
      await initialization;
      if (
        operation !== this.operation ||
        request !== this.playRequest ||
        !this.intent
      )
        return;
      await this.media.play();
      if (
        operation !== this.operation ||
        request !== this.playRequest ||
        !this.intent
      )
        return;
      this.playing = !this.media.paused && this.media.readyState >= 2;
      this.state = this.playing ? "playing" : "buffering";
      await this.updateGate();
    } catch {
      if (
        operation === this.operation &&
        request === this.playRequest &&
        this.intent
      ) {
        this.intent = false;
        this.state = "paused";
        this.notice(
          "Воспроизведение заблокировано. Нажмите «Воспроизвести» ещё раз.",
        );
      }
    }
    this.changed();
  }
  pause() {
    this.playRequest++;
    this.intent = false;
    this.playing = false;
    void this.closeGate();
    this.media.pause();
    if (this.expectedUrl) this.state = "paused";
    this.changed();
  }
  async seek(position: number) {
    if (!this.expectedUrl || !Number.isFinite(this.media.duration)) return;
    const operation = ++this.operation;
    await this.closeGate();
    if (operation !== this.operation) return;
    this.sessionId++;
    this.anchorVisual = 0;
    this.anchorFrame = 0;
    this.store.clear();
    this.playing = false;
    this.media.currentTime = Math.max(
      0,
      Math.min(this.media.duration, position),
    );
    this.changed();
    try {
      await this.waitMedia("seeked", operation);
    } catch {}
    if (operation === this.operation && this.intent) {
      this.playing =
        !this.media.paused && this.media.readyState >= 2 && !this.buffering;
      await this.updateGate();
    }
  }
  async setRate(rate: number) {
    const request = ++this.rateRequest;
    await this.closeGate();
    if (request !== this.rateRequest) return;
    this.rate = rate;
    this.media.playbackRate = rate;
    await this.updateGate();
    this.changed();
  }
  setVolume(volume: number, muted = this.muted) {
    this.volume = volume;
    this.muted = muted;
    if (this.gain && this.context) {
      this.gain.gain.cancelScheduledValues(this.context.currentTime);
      this.gain.gain.setTargetAtTime(
        muted ? 0 : volume,
        this.context.currentTime,
        0.01,
      );
    }
    this.changed();
  }
  setFrozen(frozen: boolean) {
    this.frozen = frozen;
    if (frozen) void this.closeGate();
    else {
      this.store.clear();
      this.anchorVisual = 0;
      this.anchorFrame = 0;
      void this.updateGate();
    }
    this.changed();
  }
  detach() {
    ++this.operation;
    this.intent = false;
    this.playing = false;
    void this.closeGate();
    this.expectedUrl = "";
    this.media.pause();
    this.media.removeAttribute("src");
    this.media.load();
    this.state = "empty";
    this.store.clear();
    this.anchorVisual = 0;
    this.changed();
  }
  private bypass() {
    this.capturing = false;
    this.opening = false;
    this.gateGeneration++;
    this.source?.disconnect();
    this.tapCleanup?.();
    this.tapCleanup = null;
    this.tap?.disconnect();
    this.tap?.port.close();
    this.tap = undefined;
    this.finishBoundaries(this.lastCaptureFrame);
    if (!this.destroyed && this.source && this.gain) {
      this.source.connect(this.gain);
      if (this.analyser) this.source.connect(this.analyser);
    }
  }
  private fallback(reason: string) {
    if (this.destroyed) return;
    this.bypass();
    this.stopWorker();
    this.store.fallback = true;
    this.store.error = reason;
    this.store.clear();
    this.notice(reason + " Стереометр и определение тона недоступны.");
    this.startFallback();
    this.changed();
  }
  private async recoverWorklet(reason: string) {
    if (this.recovering || this.destroyed) return;
    this.recovering = true;
    this.bypass();
    this.store.error = reason;
    this.store.clear();
    this.changed();
    if (!this.workletRetry && this.context) {
      this.workletRetry = true;
      try {
        await this.installTap();
        this.recovering = false;
        await this.updateGate();
        return;
      } catch {}
    }
    this.recovering = false;
    this.fallback(reason);
  }
  private async recoverWorker(reason: string) {
    if (this.recovering || this.destroyed) return;
    this.recovering = true;
    await this.closeGate();
    if (this.destroyed) return;
    this.store.error = reason;
    this.stopWorker();
    this.store.clear();
    this.changed();
    if (!this.workerRetry) {
      this.workerRetry = true;
      try {
        await this.startWorker();
        this.sessionId++;
        this.recovering = false;
        await this.updateGate();
        return;
      } catch {}
    }
    this.recovering = false;
    this.fallback(reason);
  }
  async retryAnalysis() {
    if (!this.context) {
      await this.play();
      return;
    }
    if (this.recovering) return;
    this.recovering = true;
    try {
      await this.closeGate();
      await this.context.resume();
      await this.startWorker();
      if (!this.context.audioWorklet) throw new Error("No worklet");
      await this.context.audioWorklet.addModule(tapUrl);
      await this.installTap();
      this.store.error = "";
      this.recovering = false;
      await this.updateGate();
    } catch {
      this.recovering = false;
      this.fallback("Не удалось восстановить анализ.");
    }
    this.changed();
  }
  private startFallback() {
    this.stopFallback();
    this.fallbackTime = 0;
    this.fallbackTimer = setInterval(() => {
      if (
        !this.analyser ||
        !this.context ||
        !this.intent ||
        !this.playing ||
        document.hidden ||
        this.frozen ||
        this.context.state !== "running" ||
        !MODULES.some((id) => this.store.settings.layout.enabled[id])
      )
        return;
      const settings = this.store.settings;
      const size = settings.spectrum.fftSize;
      this.analyser.fftSize = size;
      this.analyser.smoothingTimeConstant = settings.spectrum.smoothing / 100;
      const db = new Float32Array(size / 2);
      this.analyser.getFloatFrequencyData(db);
      const powers = Float32Array.from(db, (d) =>
        Number.isFinite(d) ? 10 ** (d / 10) : 0,
      );
      const pcm = new Float32Array(size);
      this.analyser.getFloatTimeDomainData(pcm);
      let min = 0,
        max = 0,
        energy = 0;
      for (const v of pcm) {
        min = Math.min(min, v);
        max = Math.max(max, v);
        energy += v * v;
      }
      const dt = 1 / 30;
      const time = (this.fallbackTime += dt);
      const frame = Math.floor(
        this.context.currentTime * this.context.sampleRate,
      );
      const channels = Object.fromEntries(
        ["L", "R", "M", "S"].map((id) => [
          id,
          { min, max, count: pcm.length, sumSquares: energy },
        ]),
      ) as AnalysisResult["waveform"] extends (infer U)[] | undefined
        ? U extends { channels: infer C }
          ? C
          : never
        : never;
      const result: AnalysisResult = {
        type: "result",
        sessionId: this.sessionId,
        captureEpoch: this.epoch,
        sequence: 0,
        time,
        latestFrame: frame,
        sampleRate: this.context.sampleRate,
        gap: false,
        revisions: this.store.revisions,
        rms: Math.sqrt(energy / pcm.length),
        waveform: settings.layout.enabled.waveform
          ? [
              {
                start: time - dt,
                end: time,
                firstFrame: frame - pcm.length,
                lastFrame: frame,
                gap: false,
                channels,
              },
            ]
          : undefined,
        spectrum: settings.layout.enabled.spectrum
          ? {
              time,
              latestFrame: frame,
              centerFrame: frame - size / 2,
              powers,
              fftSize: size,
              sampleRate: this.context.sampleRate,
              revision: this.store.revisions.spectrum,
            }
          : undefined,
        oscilloscope: settings.layout.enabled.oscilloscope
          ? {
              values: pcm.slice(
                -Math.min(
                  pcm.length,
                  Math.ceil(
                    (settings.oscilloscope.windowMs / 1000) *
                      this.context.sampleRate,
                  ),
                ),
              ),
              time,
              latestFrame: frame,
              startFrame: frame - pcm.length,
              duration: Math.min(
                pcm.length / this.context.sampleRate,
                settings.oscilloscope.windowMs / 1000,
              ),
              frequency: null,
              confidence: 0,
              locked: false,
              revision: this.store.revisions.oscilloscope,
              preparing: false,
            }
          : undefined,
      };
      if (settings.layout.enabled.spectrogram) {
        this.analyser.fftSize = settings.spectrogram.fftSize;
        const levels = new Float32Array(this.analyser.frequencyBinCount);
        this.analyser.getFloatFrequencyData(levels);
        const count = 256;
        const edges = new Float32Array(count + 1),
          codes = new Uint16Array(count),
          interpolated = new Uint8Array(count);
        for (let k = 0; k <= count; k++)
          edges[k] =
            20 *
            (Math.min(20000, this.context.sampleRate / 2) / 20) ** (k / count);
        for (let k = 0; k < count; k++) {
          const lo = Math.max(
              0,
              Math.floor(
                (edges[k] / this.context.sampleRate) * this.analyser.fftSize,
              ),
            ),
            hi = Math.min(
              levels.length - 1,
              Math.ceil(
                (edges[k + 1] / this.context.sampleRate) *
                  this.analyser.fftSize,
              ),
            );
          let value = -160;
          for (let j = lo; j <= hi; j++) value = Math.max(value, levels[j]);
          codes[k] =
            value <= -160 ? 0 : Math.round(((value + 160) / 320) * 65534) + 1;
        }
        result.spectrogram = [
          {
            time,
            start: time - dt,
            end: time,
            firstFrame: frame - 1024,
            lastFrame: frame,
            codes,
            edges,
            interpolated,
            gap: false,
            revision: this.store.revisions.spectrogram,
          },
        ];
      }
      this.store.accept(result);
    }, 1000 / 30);
  }
  private stopFallback() {
    if (this.fallbackTimer) clearInterval(this.fallbackTimer);
    this.fallbackTimer = undefined;
  }
  get diagnostics() {
    return {
      ...this.store.diagnostics(),
      contextState: this.context?.state ?? "not-created",
      baseLatency: this.context?.baseLatency ?? 0,
      outputLatency: this.context?.outputLatency ?? null,
      primary: !this.store.fallback && !!this.tap,
      sessionId: this.sessionId,
      epoch: this.epoch,
      capturing: this.capturing,
    };
  }
  destroy() {
    this.destroyed = true;
    this.detach();
    clearInterval(this.watchdog);
    this.stopFallback();
    this.cleanups.forEach((cleanup) => cleanup());
    this.pendingTapCancel?.();
    this.bypass();
    this.stopWorker();
    void this.context?.close();
  }
}
