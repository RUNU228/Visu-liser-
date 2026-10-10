/* Only stereo passthrough and bounded PCM copying run on the real-time thread. */
class StereoTap extends AudioWorkletProcessor {
  constructor() {
    super();
    this.pool = [];
    this.batch = null;
    this.fill = 0;
    this.attemptFill = 0;
    this.sequence = 0;
    this.open = false;
    this.pending = [];
    this.gap = true;
    this.sessionId = 0;
    this.captureEpoch = 0;
    this.firstFrame = 0;
    this.port.onmessage = ({ data }) => {
      if (data.type === "pool") {
        for (const buffer of data.buffers)
          this.pool.push(new Float32Array(buffer));
        this.port.postMessage({ type: "ready" });
      }
      if (data.type === "recycle")
        this.pool.push(new Float32Array(data.buffer));
      if (data.type === "gate") {
        if (this.pending.length >= 32) {
          this.port.postMessage({ type: "protocolerror" });
          return;
        }
        this.pending.push(data);
      }
    };
  }
  process(inputs, outputs) {
    const input = inputs[0] || [],
      output = outputs[0] || [];
    const left = input[0],
      right = input[1] || left;
    const length = output[0]?.length || left?.length || 0;
    for (let ch = 0; ch < output.length; ch++) {
      const source = ch === 0 ? left : right;
      if (source) output[ch].set(source);
      else output[ch].fill(0);
    }
    for (const command of this.pending) {
      if (this.batch) this.pool.push(this.batch);
      this.batch = null;
      this.fill = 0;
      this.attemptFill = 0;
      this.open = command.open;
      this.gap = true;
      if (command.open) {
        this.sessionId = command.sessionId;
        this.captureEpoch = command.captureEpoch;
        this.sequence = 0;
      }
      this.port.postMessage({
        type: "boundary",
        id: command.id,
        open: this.open,
        frame: currentFrame,
        sessionId: this.sessionId,
        captureEpoch: this.captureEpoch,
      });
    }
    this.pending.length = 0;
    if (!this.open) return true;
    for (let i = 0; i < length; i++) {
      if (this.attemptFill === 0) {
        this.batch = this.pool.pop() || null;
        this.firstFrame = currentFrame + i;
        this.fill = 0;
      }
      if (this.batch) {
        this.batch[this.fill * 2] = left ? left[i] : 0;
        this.batch[this.fill * 2 + 1] = right ? right[i] : 0;
        this.fill++;
      }
      this.attemptFill++;
      if (this.attemptFill === 1024) {
        const sequence = this.sequence++;
        if (this.batch) {
          const buffer = this.batch.buffer;
          this.port.postMessage(
            {
              type: "pcm",
              buffer,
              sessionId: this.sessionId,
              captureEpoch: this.captureEpoch,
              sequence,
              firstSampleIndex: this.firstFrame,
              sampleFrameCount: 1024,
              sampleRate,
              discontinuity: this.gap,
            },
            [buffer],
          );
          this.gap = false;
        } else this.gap = true;
        this.batch = null;
        this.fill = 0;
        this.attemptFill = 0;
      }
    }
    return true;
  }
}
registerProcessor("visualizer-stereo-tap", StereoTap);
