import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: [
    "--autoplay-policy=no-user-gesture-required",
    "--js-flags=--expose-gc",
  ],
});
const page = await browser.newPage({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 2,
});
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.goto("http://127.0.0.1:5173");
await page
  .locator("input[type=file]")
  .first()
  .setInputFiles("tests/fixtures/soak.mp3");
await page.getByRole("button", { name: "Воспроизвести", exact: true }).click();
await page.waitForFunction(
  () => window.visualizer.controller.audio.diagnostics.capturing,
);
const sample = () =>
  page.evaluate(() => {
    const c = window.visualizer.controller;
    return {
      wall: Date.now(),
      ...c.audio.diagnostics,
      urls: c.importer.urls.size,
      rows: c.queue.rows.length,
      history: c.audio.store.waveform.length,
      spectrogram: c.audio.store.spectrogram.length,
      stereoCount: c.audio.store.stereoCount,
      heap: performance.memory?.usedJSHeapSize ?? null,
    };
  });
await page.waitForTimeout(5000);
const samples = [await sample()];
console.log("Ten-minute continuous audio run started.");
for (let minute = 1; minute <= 10; minute++) {
  await page.waitForTimeout(60000);
  samples.push(await sample());
  console.log(
    `Minute ${minute}: capture=${samples.at(-1).capturing}, history=${samples.at(-1).historyBytes}, URLs=${samples.at(-1).urls}`,
  );
}
const data = readFileSync("tests/fixtures/stereo16.wav");
await page
  .locator("input[type=file]")
  .first()
  .setInputFiles(
    Array.from({ length: 20 }, (_, i) => ({
      name: `switch-${i}.wav`,
      mimeType: "audio/wav",
      buffer: data,
    })),
  );
await page.waitForFunction(
  () =>
    window.visualizer.controller.queue.rows.filter((r) => r.status === "ready")
      .length === 21,
);
const switchSamples = [];
for (let i = 1; i <= 20; i++) {
  await page.evaluate((index) => {
    const c = window.visualizer.controller;
    c.select(c.queue.rows[index].id);
  }, i);
  await page.waitForFunction(
    () => window.visualizer.controller.audio.diagnostics.capturing,
  );
  await page.waitForTimeout(100);
  switchSamples.push(await sample());
}
await page.evaluate(() => window.visualizer.controller.clear());
await page.waitForTimeout(5200);
await page.evaluate(() => globalThis.gc?.());
const afterClear = await sample();
const report = {
  durationSeconds: 600,
  browser: await browser.version(),
  samples,
  switches: switchSamples,
  afterClear,
  errors,
};
mkdirSync("docs/verification", { recursive: true });
writeFileSync("docs/verification/soak.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify({ afterClear, errors }));
await browser.close();
if (
  errors.length ||
  afterClear.urls !== 0 ||
  afterClear.rows !== 0 ||
  samples.some((s) => !s.capturing || s.reservedBytes > 64 * 1024 ** 2)
)
  process.exitCode = 1;
