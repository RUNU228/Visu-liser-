import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AudioEngine } from "../../src/audio/engine";
import { LocalImporter } from "../../src/player/importer";
import { QueueModel } from "../../src/player/queue";
import { defaults } from "../../src/settings/schema";

// Browser APIs require doubles in Node. Assertions exercise production lifecycle
// methods and observable packet/URL ownership, not replacement implementations.
class Media extends EventTarget {
  preload = "";
  volume = 1;
  muted = false;
  preservesPitch = true;
  paused = true;
  seeking = false;
  ended = false;
  readyState = 4;
  duration = 30;
  currentTime = 0;
  playbackRate = 1;
  src = "";
  currentSrc = "";
  error = null;
  load() {
    this.currentSrc = this.src;
    this.ended = false;
  }
  pause() {
    this.paused = true;
  }
  play() {
    this.paused = false;
    this.dispatchEvent(new Event("playing"));
    return Promise.resolve();
  }
  removeAttribute(name: string) {
    if (name === "src") this.src = "";
  }
  canPlayType(_type: string): CanPlayTypeResult {
    return "";
  }
}
class GraphNode {
  connections = new Set<unknown>();
  connect = vi.fn((target: unknown) => this.connections.add(target));
  disconnect = vi.fn(() => this.connections.clear());
  gain = { cancelScheduledValues: vi.fn(), setTargetAtTime: vi.fn() };
}
class Context extends EventTarget {
  state = "running";
  sampleRate = 48000;
  currentTime = 1;
  baseLatency = 0;
  destination = {};
  audioWorklet = { addModule: async () => {} };
  createMediaElementSource() {
    return new GraphNode();
  }
  createGain() {
    return new GraphNode();
  }
  createAnalyser() {
    return Object.assign(new GraphNode(), {
      getFloatFrequencyData: (a: Float32Array) => a.fill(-100),
      getFloatTimeDomainData: (a: Float32Array) => a.fill(0),
    });
  }
  async resume() {
    this.state = "running";
    this.dispatchEvent(new Event("statechange"));
  }
  async close() {
    this.state = "closed";
  }
}
class TestWorker {
  static all: TestWorker[] = [];
  static automaticReady = true;
  messages: any[] = [];
  terminated = false;
  onmessage: any;
  onerror: any;
  onmessageerror: any;
  constructor() {
    TestWorker.all.push(this);
    if (TestWorker.automaticReady)
      queueMicrotask(() => this.onmessage?.({ data: { type: "ready" } }));
  }
  postMessage(message: any) {
    this.messages.push(message);
  }
  terminate() {
    this.terminated = true;
  }
}
class TestTap extends EventTarget {
  static all: TestTap[] = [];
  static automatic = true;
  messages: any[] = [];
  port: any;
  connections = new Set<unknown>();
  disconnect = vi.fn(() => this.connections.clear());
  connect = vi.fn((target: unknown) => this.connections.add(target));
  constructor(
    public context?: Context,
    public processorName?: string,
    public options?: AudioWorkletNodeOptions,
  ) {
    super();
    TestTap.all.push(this);
    this.port = {
      onmessage: null,
      close: vi.fn(),
      postMessage: (message: any) => {
        this.messages.push(message);
        if (message.type === "pool")
          queueMicrotask(() => this.emit({ type: "ready" }));
        if (message.type === "gate" && TestTap.automatic)
          queueMicrotask(() => this.ack(message));
      },
    };
  }
  emit(data: any) {
    this.port.onmessage?.({ data });
  }
  ack(message: any, frame = 48000) {
    this.emit({
      type: "boundary",
      id: message.id,
      open: message.open,
      frame,
      sessionId: message.sessionId,
      captureEpoch: message.captureEpoch,
    });
  }
}
let clock = 0;
let documentDouble: EventTarget & {
  hidden: boolean;
  createElement: () => Media;
};
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
async function playing() {
  const engine = new AudioEngine(
    defaults(),
    () => {},
    () => {},
    () => {},
    () => {},
  );
  await engine.load("blob:a");
  await engine.play();
  return engine;
}
function packet(engine: AudioEngine, sessionId = engine.diagnostics.sessionId) {
  return {
    type: "pcm",
    buffer: new ArrayBuffer(8192),
    sessionId,
    captureEpoch: engine.diagnostics.epoch,
    sequence: 0,
    firstSampleIndex: 48000,
    sampleFrameCount: 1024,
    sampleRate: 48000,
  };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  clock = 0;
  TestWorker.all = [];
  TestWorker.automaticReady = true;
  TestTap.all = [];
  TestTap.automatic = true;
  documentDouble = Object.assign(new EventTarget(), {
    hidden: false,
    createElement: () => new Media(),
  });
  vi.stubGlobal("document", documentDouble);
  vi.stubGlobal("innerWidth", 1440);
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  vi.stubGlobal("AudioContext", Context);
  vi.stubGlobal("AudioWorkletNode", TestTap);
  vi.stubGlobal("Worker", TestWorker);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("audio lifecycle boundaries", () => {
  it("hidden, buffering and disabled capture keep playback intent without watchdog restarts", async () => {
    const engine = await playing();
    const originalWorker = TestWorker.all.at(-1)!;
    const originalEpoch = engine.diagnostics.epoch;
    engine.store.waveform = [{ start: 0, end: 1 } as any];
    documentDouble.hidden = true;
    documentDouble.dispatchEvent(new Event("visibilitychange"));
    await flush();
    expect(engine.diagnostics.capturing).toBe(false);
    expect(engine.media.paused).toBe(false);
    clock += 4000;
    await vi.advanceTimersByTimeAsync(4000);
    expect(TestWorker.all.at(-1)).toBe(originalWorker);
    documentDouble.hidden = false;
    documentDouble.dispatchEvent(new Event("visibilitychange"));
    await flush();
    expect(engine.store.waveform).toHaveLength(0);
    expect(engine.diagnostics.capturing).toBe(true);
    expect(engine.diagnostics.epoch).toBeGreaterThan(originalEpoch);
    const media = engine.media as unknown as Media;
    media.readyState = 2;
    media.dispatchEvent(new Event("waiting"));
    await flush();
    expect(engine.state).toBe("buffering");
    expect(engine.diagnostics.capturing).toBe(false);
    expect(engine.intent).toBe(true);
    clock += 4000;
    await vi.advanceTimersByTimeAsync(4000);
    expect(TestWorker.all.at(-1)).toBe(originalWorker);
    media.readyState = 4;
    media.dispatchEvent(new Event("playing"));
    await flush();
    expect(engine.diagnostics.capturing).toBe(true);
    const hidden = defaults();
    for (const module of Object.keys(hidden.layout.enabled))
      hidden.layout.enabled[module as keyof typeof hidden.layout.enabled] =
        false;
    engine.configure(hidden);
    await flush();
    expect(engine.diagnostics.capturing).toBe(false);
    expect(engine.intent).toBe(true);
    expect(engine.media.paused).toBe(false);
    engine.configure(defaults());
    await flush();
    expect(engine.diagnostics.capturing).toBe(true);
    engine.destroy();
  });
  it("shares an outstanding close and commits only the latest load after its acknowledgment", async () => {
    const engine = await playing();
    const tap = TestTap.all.at(-1)!;
    TestTap.automatic = false;
    const first = engine.load("blob:b");
    const second = engine.load("blob:c");
    await flush();
    expect(engine.media.src).toBe("blob:a");
    const closes = tap.messages.filter((m) => m.type === "gate" && !m.open);
    expect(closes).toHaveLength(1);
    tap.ack(closes[0]);
    TestTap.automatic = true;
    await Promise.all([first, second]);
    expect(engine.media.src).toBe("blob:c");
    expect(engine.diagnostics.capturing).toBe(true);
    engine.destroy();
  });
  it("manual retry opens precisely the session that will accept its PCM", async () => {
    const engine = await playing();
    await engine.retryAnalysis();
    await flush();
    const tap = TestTap.all.at(-1)!;
    const gate = tap.messages.filter((m) => m.type === "gate" && m.open).at(-1);
    expect(gate).toBeDefined();
    expect(gate.sessionId).toBe(engine.diagnostics.sessionId);
    tap.emit(packet(engine, gate.sessionId));
    expect(TestWorker.all.at(-1)!.messages.some((m) => m.type === "pcm")).toBe(
      true,
    );
    engine.destroy();
  });
  it("detects a hung Worker even after its transferred PCM pool stops producing packets", async () => {
    const engine = await playing();
    const tap = TestTap.all.at(-1)!;
    for (let i = 0; i < 12; i++) {
      clock = i * 22;
      tap.emit({ ...packet(engine), sequence: i });
    }
    clock = 1400;
    await vi.advanceTimersByTimeAsync(1200);
    expect(TestWorker.all[0].terminated).toBe(true);
    expect(TestWorker.all).toHaveLength(2);
    engine.destroy();
  });
  it("replenishes exactly Worker-owned buffers after a crash before reopening", async () => {
    const engine = await playing();
    const tap = TestTap.all.at(-1)!;
    for (let i = 0; i < 5; i++) tap.emit({ ...packet(engine), sequence: i });
    const old = TestWorker.all[0];
    old.onerror();
    await flush();
    const pools = tap.messages.filter((m) => m.type === "pool");
    expect(pools.reduce((n, m) => n + m.buffers.length, 0)).toBe(17);
    expect(engine.diagnostics.capturing).toBe(true);
    engine.destroy();
  });
  it("defers a boundary deadline when the AudioContext becomes suspended", async () => {
    const engine = await playing();
    const tap = TestTap.all.at(-1)!;
    TestTap.automatic = false;
    engine.pause();
    const load = engine.load("blob:b");
    (engine.context as any).state = "suspended";
    engine.context!.dispatchEvent(new Event("statechange"));
    await flush();
    expect(engine.media.src).toBe("blob:b");
    await vi.advanceTimersByTimeAsync(300);
    expect(TestTap.all).toHaveLength(1);
    TestTap.automatic = true;
    (engine.context as any).state = "running";
    engine.context!.dispatchEvent(new Event("statechange"));
    for (const m of tap.messages.filter((m) => m.type === "gate")) tap.ack(m);
    await load;
    await flush();
    engine.destroy();
  });
  it("invalidates old spectral smoothing results when smoothing changes", async () => {
    const engine = await playing();
    const old = engine.store.revisions.spectrum;
    const settings = defaults();
    settings.spectrum.smoothing = 50;
    engine.configure(settings);
    expect(engine.store.revisions.spectrum).toBe(old + 1);
    engine.destroy();
  });
  it("ignores obsolete ended and pause notifications while the current source is playing", async () => {
    let ends = 0;
    const engine = new AudioEngine(
      defaults(),
      () => {},
      () => {},
      () => ends++,
      () => {},
    );
    await engine.load("blob:a");
    await engine.play();
    engine.media.dispatchEvent(new Event("ended"));
    engine.media.dispatchEvent(new Event("pause"));
    await flush();
    expect(ends).toBe(0);
    expect(engine.state).toBe("playing");
    expect(engine.diagnostics.capturing).toBe(true);
    engine.destroy();
  });
  it("teardown cancels incomplete Worker initialization without starting a later fallback", async () => {
    TestWorker.automaticReady = false;
    const engine = new AudioEngine(
      defaults(),
      () => {},
      () => {},
      () => {},
      () => {},
    );
    await engine.load("blob:a");
    const play = engine.play();
    engine.destroy();
    await vi.advanceTimersByTimeAsync(2100);
    await play;
    expect(engine.store.fallback).toBe(false);
    expect(TestTap.all).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("a retired processor error cannot replace the newly installed healthy tap", async () => {
    const engine = await playing();
    const retired = TestTap.all[0];
    await engine.retryAnalysis();
    retired.dispatchEvent(new Event("processorerror"));
    await flush();
    expect(TestTap.all).toHaveLength(2);
    expect(engine.diagnostics.capturing).toBe(true);
    engine.destroy();
  });
  it("keeps one destination route and explicit stereo speaker interpretation across primary and bypass", async () => {
    const engine = await playing();
    const graph = engine as unknown as {
      source: GraphNode;
      gain: GraphNode & {
        channelCount: number;
        channelCountMode: string;
        channelInterpretation: string;
      };
    };
    const destination = engine.context!.destination;
    const routes = (node: unknown, visited = new Set<unknown>()): number => {
      if (node === destination) return 1;
      if (visited.has(node)) return 0;
      const path = new Set(visited).add(node);
      const connections = (node as { connections?: Set<unknown> }).connections;
      return [...(connections ?? [])].reduce<number>(
        (count, next) => count + routes(next, path),
        0,
      );
    };
    const originalTap = TestTap.all[0];
    expect(originalTap.options).toMatchObject({
      channelCount: 2,
      channelCountMode: "explicit",
      channelInterpretation: "speakers",
      outputChannelCount: [2],
    });
    expect(graph.gain).toMatchObject({
      channelCount: 2,
      channelCountMode: "explicit",
      channelInterpretation: "speakers",
    });
    expect(routes(graph.source)).toBe(1);
    expect(graph.source.connections.has(originalTap)).toBe(true);
    expect(graph.source.connections.has(graph.gain)).toBe(false);
    originalTap.dispatchEvent(new Event("processorerror"));
    // Recovery connects bypass synchronously before its replacement handshake.
    expect(routes(graph.source)).toBe(1);
    expect(graph.source.connections.has(graph.gain)).toBe(true);
    expect(graph.source.connections.has(originalTap)).toBe(false);
    expect(originalTap.connections.size).toBe(0);
    await flush();
    const replacement = TestTap.all[1];
    expect(graph.source.connections.has(replacement)).toBe(true);
    expect(graph.source.connections.has(graph.gain)).toBe(false);
    expect(routes(graph.source)).toBe(1);
    expect(engine.media.volume).toBe(1);
    expect(engine.media.muted).toBe(false);
    engine.destroy();
  });
});

describe("probe ownership", () => {
  function probeSession() {
    const media = new Media();
    documentDouble.createElement = () => media;
    let sequence = 0;
    const created = vi
      .spyOn(URL, "createObjectURL")
      .mockImplementation(() => `blob:import-${sequence++}`);
    const revoked = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation((url) => {
        // No URL may be revoked while this probe still owns it.
        expect(media.src).not.toBe(url);
        expect(media.currentSrc).not.toBe(url);
      });
    const notices: string[] = [];
    const queue = new QueueModel();
    const importer = new LocalImporter(
      queue,
      () => {},
      (text) => notices.push(text),
    );
    return { media, created, revoked, notices, queue, importer };
  }
  it("reserves the 100-row limit across overlapping batches before metadata completes", async () => {
    const h = probeSession();
    const first = Array.from(
      { length: 75 },
      (_, i) => new File(["x"], `first-${i}.wav`),
    );
    const second = Array.from(
      { length: 40 },
      (_, i) => new File(["x"], `second-${i}.wav`),
    );
    h.importer.add(first);
    h.importer.add(second);
    expect(h.queue.rows).toHaveLength(100);
    expect(h.importer.pending).toBe(100);
    expect(h.queue.rows.map((row) => row.file.name)).toEqual([
      ...first.map((file) => file.name),
      ...second.slice(0, 25).map((file) => file.name),
    ]);
    expect(h.notices).toHaveLength(15);
    expect(h.notices.every((notice) => notice.includes("100"))).toBe(true);
    expect(h.created).toHaveBeenCalledTimes(1);
    h.media.dispatchEvent(new Event("loadedmetadata"));
    await flush();
    expect(h.queue.rows[0].status).toBe("ready");
    expect(h.created).toHaveBeenCalledTimes(2);
    expect(h.created.mock.calls[1][0]).toBe(first[1]);
    expect(h.queue.rows[75].status).toBe("pending");
    h.importer.destroy();
    await flush();
  });
  it("rejects files above 250 MiB without allocating their object URL", async () => {
    const h = probeSession();
    const oversized = new File(["x"], "too-large.wav");
    Object.defineProperty(oversized, "size", { value: 250 * 1024 ** 2 + 1 });
    const boundary = new File(["x"], "at-limit.wav");
    Object.defineProperty(boundary, "size", { value: 250 * 1024 ** 2 });
    h.importer.add([oversized, boundary]);
    expect(h.queue.rows.map((row) => row.status)).toEqual([
      "failed",
      "pending",
    ]);
    expect(h.queue.rows[0].url).toBe("");
    expect(h.queue.rows[0].error).toContain("250");
    expect(h.created).toHaveBeenCalledTimes(1);
    expect(h.created.mock.calls[0][0]).toBe(boundary);
    h.media.dispatchEvent(new Event("loadedmetadata"));
    await flush();
    expect(h.queue.rows[1].status).toBe("ready");
    expect(h.importer.urls.size).toBe(1);
    h.importer.destroy();
    await flush();
  });
  it("cancel retains completed rows, detaches the active probe and rejects its late callbacks", async () => {
    const h = probeSession();
    const listeners = vi.spyOn(h.media, "addEventListener");
    h.importer.add(
      ["complete.wav", "active.wav", "unprocessed.wav"].map(
        (name) => new File(["x"], name),
      ),
    );
    h.media.dispatchEvent(new Event("loadedmetadata"));
    await flush();
    const completed = h.queue.rows[0];
    const active = h.queue.rows[1];
    const lateMetadata = listeners.mock.calls.filter(
      ([name]) => name === "loadedmetadata",
    )[1][1] as EventListener;
    const lateError = listeners.mock.calls.filter(
      ([name]) => name === "error",
    )[1][1] as EventListener;
    h.importer.cancel();
    expect(h.media.src).toBe("");
    expect(h.media.currentSrc).toBe("");
    expect(h.queue.rows).toEqual([completed]);
    expect(h.revoked.mock.calls.map(([url]) => url)).toEqual([active.url]);
    expect(h.importer.urls).toEqual(new Set([completed.url]));
    h.importer.add([new File(["x"], "new-batch.wav")]);
    await flush();
    const newBatch = h.queue.rows[1];
    lateMetadata.call(h.media, new Event("loadedmetadata"));
    lateError.call(h.media, new Event("error"));
    await flush();
    expect(newBatch.status).toBe("pending");
    expect(h.media.src).toBe(newBatch.url);
    expect(h.created).toHaveBeenCalledTimes(3);
    h.media.dispatchEvent(new Event("loadedmetadata"));
    await flush();
    expect(h.queue.rows.map((row) => row.file.name)).toEqual([
      "complete.wav",
      "new-batch.wav",
    ]);
    expect(h.queue.rows.every((row) => row.status === "ready")).toBe(true);
    expect(h.importer.pending).toBe(0);
    expect(h.importer.urls).toEqual(new Set([completed.url, newBatch.url]));
    h.importer.destroy();
    await flush();
    expect(h.importer.urls.size).toBe(0);
  });
  it("turns a ten-second metadata timeout into a retryable row with a fresh URL", async () => {
    const h = probeSession();
    h.queue.setShuffle(true);
    h.importer.add([new File(["x"], "slow.wav")]);
    const row = h.queue.rows[0];
    const initialUrl = row.url;
    await vi.advanceTimersByTimeAsync(9999);
    expect(row.status).toBe("pending");
    expect(h.revoked).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(row.status).toBe("failed");
    expect(row.error).toContain("10 секунд");
    expect(row.url).toBe("");
    expect(h.media.src).toBe("");
    expect(h.importer.urls.size).toBe(0);
    expect(h.revoked.mock.calls.map(([url]) => url)).toEqual([initialUrl]);
    h.importer.retry(row);
    expect(row.status).toBe("pending");
    expect(row.url).not.toBe(initialUrl);
    expect(row.error).toBeUndefined();
    h.media.duration = 42;
    h.media.dispatchEvent(new Event("loadedmetadata"));
    await flush();
    expect(h.queue.rows).toEqual([row]);
    expect(row.status).toBe("ready");
    expect(row.duration).toBe(42);
    expect(h.queue.remaining).toEqual([row.id]);
    expect(h.importer.urls).toEqual(new Set([row.url]));
    h.importer.destroy();
    await flush();
  });
  it("consults codec hints while accepting files that pass actual metadata loading", async () => {
    const media = new Media();
    documentDouble.createElement = () => media;
    const hint = vi.spyOn(media, "canPlayType");
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:probe");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const queue = new QueueModel();
    const importer = new LocalImporter(
      queue,
      () => {},
      () => {},
    );
    importer.add([new File(["x"], "a.wav")]);
    media.dispatchEvent(new Event("loadedmetadata"));
    await flush();
    expect(hint).toHaveBeenCalledWith("audio/wav");
    expect(queue.rows[0].status).toBe("ready");
    importer.destroy();
  });
  it("detaches an active probe before removing and revoking its preparation URL", async () => {
    const media = new Media();
    documentDouble.createElement = () => media;
    let sequence = 0;
    vi.spyOn(URL, "createObjectURL").mockImplementation(
      () => `blob:probe-${sequence++}`,
    );
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {
      expect(media.src).toBe("");
    });
    const queue = new QueueModel();
    const importer = new LocalImporter(
      queue,
      () => {},
      () => {},
    );
    importer.add([new File(["x"], "a.wav")]);
    const row = queue.rows[0];
    queue.remove(row.id);
    importer.release(row.url);
    await flush();
    expect(media.src).toBe("");
    expect(importer.pending).toBe(0);
    importer.destroy();
  });
});
