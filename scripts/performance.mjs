import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
const browser = await chromium.launch({
  channel: process.env.TEST_BROWSER || "chrome",
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 2,
});
await page.goto(process.env.TEST_BASE_URL || "http://127.0.0.1:5173");
await page
  .locator("input[type=file]")
  .first()
  .setInputFiles("tests/fixtures/long.wav");
await page.getByRole("button", { name: "Play", exact: true }).click();
await page.waitForFunction(
  () => window.visualizer?.controller.audio.store.spectrum,
);
await page.waitForTimeout(3000);
await page.evaluate(() => {
  const store = window.visualizer.controller.audio.store;
  store.latency = [];
  store.centerAge = [];
  store.frameTimes = [];
  store.renderTimes = [];
  store.lastRender = 0;
});
console.log("60-second default run started.");
await page.waitForTimeout(60000);
const report = await page.evaluate(() => ({
  browser: navigator.userAgent,
  viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
  durationSeconds: 60,
  ...window.visualizer.controller.audio.diagnostics,
  effective: window.visualizer.scheduler.effective,
  canvasBytes: [...document.querySelectorAll("canvas")].reduce(
    (sum, c) => sum + c.width * c.height * 4,
    0,
  ),
  offscreenCanvasBytes: [...window.visualizer.scheduler.plots.values()].reduce(
    (sum, plot) =>
      sum + plot.renderer.raster.width * plot.renderer.raster.height * 4,
    0,
  ),
  heap: performance.memory
    ? {
        used: performance.memory.usedJSHeapSize,
        total: performance.memory.totalJSHeapSize,
      }
    : null,
}));
mkdirSync("docs/verification", { recursive: true });
writeFileSync(
  `docs/verification/performance-${process.env.TEST_BROWSER || "chrome"}.json`,
  JSON.stringify(report, null, 2),
);
await page.screenshot({
  path: `docs/screenshots/${process.env.TEST_BROWSER || "chrome"}-playing-1920.png`,
  fullPage: true,
});
console.log(JSON.stringify(report, null, 2));
await browser.close();
if (report.latencyP95 > 150 || report.gaps > 3) process.exitCode = 1;
