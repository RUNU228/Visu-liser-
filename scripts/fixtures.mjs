import { mkdirSync, writeFileSync } from "node:fs";
mkdirSync("tests/fixtures", { recursive: true });
export function wav({
  seconds = 12,
  bits = 16,
  channels = 2,
  mode = "stereo",
} = {}) {
  const rate = 48000,
    frames = seconds * rate,
    bytes = bits / 8,
    pcm = Buffer.alloc(frames * channels * bytes),
    header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * channels * bytes, 28);
  header.writeUInt16LE(channels * bytes, 32);
  header.writeUInt16LE(bits, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  for (let i = 0; i < frames; i++) {
    const t = i / rate;
    const l =
      mode === "silence"
        ? 0
        : 0.5 * Math.sin(2 * Math.PI * 100 * t) +
          0.12 * Math.sin(2 * Math.PI * 750 * t);
    const r =
      mode === "silence"
        ? 0
        : mode === "anti"
          ? -l
          : mode === "mono"
            ? l
            : mode === "left"
              ? 0
              : 0.4 * Math.sin(2 * Math.PI * 100 * t) +
                0.2 * Math.sin(2 * Math.PI * 1500 * t);
    for (let ch = 0; ch < channels; ch++) {
      const value =
          ch === 0
            ? l
            : ch === 1
              ? r
              : ch === 2
                ? 0.3 * Math.sin(2 * Math.PI * 300 * t)
                : ch === 3
                  ? 0.3 * Math.sin(2 * Math.PI * 400 * t)
                  : ch === 4
                    ? 0.3 * Math.sin(2 * Math.PI * 500 * t)
                    : 0.3 * Math.sin(2 * Math.PI * 600 * t),
        int = Math.round(value * (2 ** (bits - 1) - 1)),
        offset = (i * channels + ch) * bytes;
      if (bits === 16) pcm.writeInt16LE(int, offset);
      else pcm.writeIntLE(int, offset, 3);
    }
  }
  return Buffer.concat([header, pcm]);
}
writeFileSync("tests/fixtures/stereo16.wav", wav());
writeFileSync("tests/fixtures/stereo24.wav", wav({ bits: 24 }));
writeFileSync("tests/fixtures/mono.wav", wav({ channels: 1, mode: "mono" }));
writeFileSync("tests/fixtures/anti.wav", wav({ mode: "anti" }));
writeFileSync("tests/fixtures/silence.wav", wav({ mode: "silence" }));
writeFileSync("tests/fixtures/quad.wav", wav({ channels: 4 }));
writeFileSync("tests/fixtures/5.1.wav", wav({ channels: 6 }));
writeFileSync("tests/fixtures/long.wav", wav({ seconds: 90 }));
writeFileSync("tests/fixtures/corrupt.mp3", "This is not audio.");
