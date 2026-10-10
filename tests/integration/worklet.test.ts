import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";
function harness() {
  let Processor: any;
  const messages: any[] = [];
  const state: any = {
    sampleRate: 48000,
    currentFrame: 0,
    AudioWorkletProcessor: class {
      port = {
        onmessage: null as any,
        postMessage: (m: any) => messages.push(m),
      };
    },
    registerProcessor: (_: string, p: any) => (Processor = p),
  };
  vm.runInNewContext(readFileSync("src/audio/worklets/tap.js", "utf8"), state);
  const p = new Processor();
  const send = (data: any) => p.port.onmessage({ data });
  return { p, state, send, messages };
}
describe("PCM capture worklet", () => {
  it("acknowledges every ordered gate command arriving before one render quantum", () => {
    const h = harness();
    h.send({ type: "pool", buffers: [new ArrayBuffer(8192)] });
    h.send({ type: "gate", open: false, id: 1 });
    h.send({ type: "gate", open: true, id: 2, sessionId: 2, captureEpoch: 3 });
    h.p.process(
      [[new Float32Array(128)]],
      [[new Float32Array(128), new Float32Array(128)]],
    );
    expect(
      h.messages
        .filter((m: any) => m.type === "boundary")
        .map((m: any) => m.id),
    ).toEqual([1, 2]);
  });
  it("duplicates mono and passes stereo unchanged even with capture closed", () => {
    const h = harness();
    const mono = new Float32Array([0.5, -0.2, 0.1]);
    const out = [new Float32Array(3), new Float32Array(3)];
    h.p.process([[mono]], [out]);
    expect(Array.from(out[0])).toEqual(Array.from(mono));
    expect(Array.from(out[1])).toEqual(Array.from(mono));
  });
  it("acknowledges boundaries at sample frame and never sends partial batches", () => {
    const h = harness();
    h.send({ type: "pool", buffers: [new ArrayBuffer(8192)] });
    h.send({ type: "gate", open: true, id: 1, sessionId: 7, captureEpoch: 2 });
    const input = [
      new Float32Array(128).fill(0.5),
      new Float32Array(128).fill(-0.5),
    ];
    for (let i = 0; i < 8; i++) {
      h.state.currentFrame = i * 128;
      h.p.process([input], [[new Float32Array(128), new Float32Array(128)]]);
    }
    const packet = h.messages.find((m: any) => m.type === "pcm");
    expect(packet.firstSampleIndex).toBe(0);
    expect(packet.sampleFrameCount).toBe(1024);
    expect(packet.sessionId).toBe(7);
    expect(Array.from(new Float32Array(packet.buffer).slice(0, 4))).toEqual([
      0.5, -0.5, 0.5, -0.5,
    ]);
    h.send({ type: "gate", open: false, id: 2 });
    h.state.currentFrame = 1024;
    h.p.process([input], [[new Float32Array(128), new Float32Array(128)]]);
    expect(h.messages.at(-1)).toMatchObject({
      type: "boundary",
      id: 2,
      frame: 1024,
      open: false,
    });
  });
  it("pool exhaustion never blocks passthrough and marks returned capture discontinuous", () => {
    const h = harness();
    h.send({ type: "pool", buffers: [new ArrayBuffer(8192)] });
    h.send({ type: "gate", open: true, id: 1, sessionId: 1, captureEpoch: 1 });
    for (let i = 0; i < 16; i++) {
      h.state.currentFrame = i * 128;
      h.p.process(
        [[new Float32Array(128).fill(0.8)]],
        [[new Float32Array(128), new Float32Array(128)]],
      );
    }
    const first = h.messages.find((m: any) => m.type === "pcm");
    h.send({ type: "recycle", buffer: first.buffer });
    for (let i = 16; i < 24; i++) {
      h.state.currentFrame = i * 128;
      h.p.process(
        [[new Float32Array(128).fill(0.8)]],
        [[new Float32Array(128), new Float32Array(128)]],
      );
    }
    const packets = h.messages.filter((m: any) => m.type === "pcm");
    expect(packets).toHaveLength(2);
    expect(packets[1].discontinuity).toBe(true);
    expect(packets[1].sequence).toBe(2);
  });
});
