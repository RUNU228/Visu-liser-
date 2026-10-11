import { test, expect } from "@playwright/test";
test("real local playback drives all five modules and survives transport boundaries", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles([
      "tests/fixtures/stereo16.wav",
      "tests/fixtures/stereo24.wav",
    ]);
  await expect(page.getByText("stereo16", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const a = (window as any).visualizer.controller.audio;
        return {
          primary: a.diagnostics.primary,
          capturing: a.diagnostics.capturing,
          wave: a.store.waveform.length > 0,
          spectral: a.store.spectrogram.length > 0,
          spectrum: !!a.store.spectrum,
          stereo: !!a.store.stereometer,
          scope: a.store.oscilloscope?.frequency !== null,
        };
      }),
    )
    .toEqual({
      primary: true,
      capturing: true,
      wave: true,
      spectral: true,
      spectrum: true,
      stereo: true,
      scope: true,
    });
  await page.screenshot({
    path: test
      .info()
      .outputPath(`${test.info().project.name}-playing-1440.png`),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const paused = await page.evaluate(
    () => (window as any).visualizer.controller.audio.store.time,
  );
  await page.waitForTimeout(250);
  expect(
    await page.evaluate(
      () => (window as any).visualizer.controller.audio.store.time,
    ),
  ).toBe(paused);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).visualizer.controller.audio.store.time,
      ),
    )
    .toBeGreaterThan(paused);
  await page.getByRole("button", { name: "Mute", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).visualizer.controller.audio.store.rms,
      ),
    )
    .toBeGreaterThan(0.01);
  await page.evaluate(async () => {
    await (window as any).visualizer.controller.audio.seek(3);
  });
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).visualizer.controller.audio.diagnostics.capturing,
      ),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Next track", exact: true }).click();
  await expect(page.getByText("stereo24", { exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).visualizer.controller.audio.diagnostics.capturing,
      ),
    )
    .toBe(true);
  expect(errors).toEqual([]);
});
test("responsive layouts, settings modal, persistence and queue undo", async ({
  page,
}) => {
  await page.goto("/");
  for (const width of [360, 390, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: test
        .info()
        .outputPath(`${test.info().project.name}-empty-${width}.png`),
      fullPage: true,
    });
  }
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Night Trace", exact: true }).click();
  await page.getByRole("button", { name: "Close panel" }).click();
  expect(await page.locator("html").getAttribute("data-theme")).toBe("dark");
  await page.reload();
  expect(await page.locator("html").getAttribute("data-theme")).toBe("dark");
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles("tests/fixtures/stereo16.wav");
  await expect(page.getByText("stereo16", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Queue, 1/ }).click();
  await page.getByRole("button", { name: "Clear queue", exact: true }).click();
  await page
    .getByRole("button", { name: "Undo clear · 5 s", exact: true })
    .click();
  await page.getByRole("button", { name: "Close panel" }).click();
  await expect(page.getByText("stereo16", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as any).visualizer.controller.audio.intent,
    ),
  ).toBe(false);
});
