import ffmpeg from "ffmpeg-static";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
const cases = [
  ["mp3", "libmp3lame"],
  ["flac", "flac"],
  ["m4a", "aac"],
  ["ogg", "libvorbis"],
  ["opus.ogg", "libopus"],
  ["webm", "libopus"],
];
for (const [extension, codec] of cases) {
  const args = [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    "tests/fixtures/stereo16.wav",
    "-c:a",
    codec,
    `tests/fixtures/stereo.${extension}`,
  ];
  const r = spawnSync(ffmpeg, args, { encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr);
}
const version = spawnSync(ffmpeg, ["-version"], {
  encoding: "utf8",
}).stdout.split("\n")[0];
writeFileSync(
  "tests/fixtures/codecs.json",
  JSON.stringify(
    {
      generator: version,
      sampleRate: 48000,
      channels: 2,
      duration: 12,
      codecs: cases,
    },
    null,
    2,
  ),
);
console.log(version);
