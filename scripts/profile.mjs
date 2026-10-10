import { chromium } from "@playwright/test";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 2,
});
await page.goto("http://127.0.0.1:5173");
await page
  .locator("input[type=file]")
  .first()
  .setInputFiles("tests/fixtures/long.wav");
await page.getByRole("button", { name: "Воспроизвести", exact: true }).click();
await page.waitForTimeout(8500);
await page.evaluate(() => {
  window.profileTimes = {};
  for (const [id, plot] of window.visualizer.scheduler.plots) {
    const render = plot.renderer.render.bind(plot.renderer);
    window.profileTimes[id] = [];
    plot.renderer.render = (...args) => {
      const start = performance.now();
      render(...args);
      window.profileTimes[id].push(performance.now() - start);
    };
  }
});
await page.waitForTimeout(10000);
console.log(
  await page.evaluate(() =>
    Object.fromEntries(
      Object.entries(window.profileTimes).map(([id, values]) => {
        values.sort((a, b) => a - b);
        return [
          id,
          {
            median: values[Math.floor(values.length * 0.5)],
            p95: values[Math.floor(values.length * 0.95)],
            count: values.length,
          },
        ];
      }),
    ),
  ),
);
await browser.close();
