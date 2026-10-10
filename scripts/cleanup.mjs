import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage();
await page.goto("http://127.0.0.1:5173");
const cdp = await page.context().newCDPSession(page);
const sample = async () => ({
  heap: await cdp.send("Runtime.getHeapUsage"),
  owners: await page.evaluate(() => {
    const c = window.visualizer.controller;
    return {
      urls: c.importer.urls.size,
      queue: c.queue.rows.length,
      undo: !!c.undo,
      history: c.audio.diagnostics.historyBytes,
    };
  }),
});
await cdp.send("HeapProfiler.collectGarbage");
const baseline = await sample();
const data = readFileSync("tests/fixtures/stereo16.wav");
await page
  .locator("input[type=file]")
  .first()
  .setInputFiles(
    Array.from({ length: 20 }, (_, index) => ({
      name: `owner-${index}.wav`,
      mimeType: "audio/wav",
      buffer: data,
    })),
  );
await page.waitForFunction(
  () =>
    window.visualizer.controller.queue.rows.filter(
      (row) => row.status === "ready",
    ).length === 20,
);
await page.getByRole("button", { name: "Воспроизвести", exact: true }).click();
for (let i = 1; i < 20; i++) {
  await page.evaluate((index) => {
    const c = window.visualizer.controller;
    c.select(c.queue.rows[index].id);
  }, i);
  await page.waitForTimeout(100);
}
const peak = await sample();
await page.evaluate(() => window.visualizer.controller.clear());
await page.waitForTimeout(5500);
await cdp.send("HeapProfiler.collectGarbage");
await page.waitForTimeout(1000);
await cdp.send("HeapProfiler.collectGarbage");
const cleared = await sample();
await page.evaluate(() => {
  window.visualizer.scheduler.destroy();
  window.visualizer.controller.destroy();
});
await cdp.send("HeapProfiler.collectGarbage");
const destroyed = await sample();
const result = {
  browser: await browser.version(),
  baseline,
  peak,
  cleared,
  destroyed,
};
writeFileSync(
  "docs/verification/ownership-cleanup.json",
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result, null, 2));
await browser.close();
if (
  cleared.owners.urls ||
  cleared.owners.queue ||
  cleared.owners.undo ||
  cleared.owners.history
)
  process.exitCode = 1;
