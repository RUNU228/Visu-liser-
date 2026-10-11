import { test, expect, type Page } from "@playwright/test";

async function play(page: Page) {
  await page.goto("/");
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles(["tests/fixtures/long.wav", "tests/fixtures/silence.wav"]);
  await expect(
    page.getByRole("button", { name: "Воспроизвести", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Воспроизвести", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () => !!(window as any).visualizer.controller.audio.store.spectrum,
      ),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Пауза", exact: true }).click();
}
async function inspect(page: Page, id: string, u = 0.5, v = 0.5) {
  const canvas = page.locator(`.module-${id} canvas`);
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  await canvas.click({
    position: { x: 36 + (box.width - 48) * u, y: 10 + (box.height - 38) * v },
  });
  return page.locator(`.module-${id} .plot-tooltip`);
}

test("H-01 Spectrum pointer uses local rendered buckets across layout sizes", async ({
  page,
}) => {
  await play(page);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const ranges = [];
    for (const u of [0.1, 0.5, 0.9]) {
      const tip = await inspect(page, "spectrum", u);
      ranges.push((await tip.textContent())!.split(" · ")[0]);
      await page.locator(".module-spectrum canvas").press("Escape");
    }
    expect(new Set(ranges).size).toBe(3);
  }
});

test("M-01 fade keyboard crosses Off and 2 seconds both ways", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Настройки Spectrogram", exact: true })
    .click();
  const fade = page.getByRole("slider", {
    name: "Затухание истории",
    exact: true,
  });
  await fade.focus();
  await fade.press("ArrowRight");
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).visualizer.controller.settings.spectrogram.fade,
      ),
    )
    .toBe(2);
  await fade.press("ArrowRight");
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).visualizer.controller.settings.spectrogram.fade,
      ),
    )
    .toBe(3);
  await fade.press("ArrowLeft");
  await fade.press("ArrowLeft");
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).visualizer.controller.settings.spectrogram.fade,
      ),
    )
    .toBe(0);
  await page.evaluate(() => {
    const c = (window as any).visualizer.controller;
    const s = structuredClone(c.settings);
    s.spectrogram.fade = 2.5;
    c.setSettings(s);
  });
  await expect(fade).toHaveValue("2");
  await fade.press("ArrowRight");
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).visualizer.controller.settings.spectrogram.fade,
      ),
    )
    .toBe(3);
  await fade.press("ArrowLeft");
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).visualizer.controller.settings.spectrogram.fade,
      ),
    )
    .toBe(2);
});

test("M-02/M-07 pinned measurements invalidate at reset boundaries; pause preserves RMS", async ({
  page,
}) => {
  await play(page);
  expect(
    await page.evaluate(
      () => (window as any).visualizer.controller.audio.store.rms,
    ),
  ).toBeGreaterThan(0);
  const pin = await inspect(page, "spectrum");
  await expect(pin).toBeVisible();
  await page
    .getByRole("button", { name: "Следующая дорожка", exact: true })
    .click();
  await expect(pin).toBeHidden();
  await page.evaluate(() =>
    (window as any).visualizer.controller.audio.seek(0.2),
  );
  await inspect(page, "spectrum");
  await page.evaluate(() =>
    (window as any).visualizer.controller.audio.seek(0.4),
  );
  await expect(pin).toBeHidden();
  await inspect(page, "spectrum");
  await page.evaluate(() => {
    const c = (window as any).visualizer.controller;
    const s = structuredClone(c.settings);
    s.spectrum.fftSize = 1024;
    c.setSettings(s);
  });
  await expect(pin).toBeHidden();
  await inspect(page, "spectrum");
  await page.evaluate(() => (window as any).visualizer.controller.clear());
  await expect(pin).toBeHidden();
  await expect(page.locator(".module-waveform .sr-only")).toContainText(
    "Текущий RMS: 0.0000.",
  );
  await page.evaluate(() =>
    (window as any).visualizer.controller.restoreUndo(),
  );
  await expect(pin).toBeHidden();
});

test("M-03 Strip focus expands every module and restores layout", async ({
  page,
}) => {
  await play(page);
  await page.evaluate(() => {
    const c = (window as any).visualizer.controller;
    const s = structuredClone(c.settings);
    s.layout.requested = "strip";
    c.setSettings(s);
  });
  for (const width of [1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const id of [
      "Spectrogram",
      "Waveform",
      "Stereometer",
      "Oscilloscope",
      "Spectrum",
    ]) {
      await page
        .getByRole("button", { name: `Развернуть ${id}`, exact: true })
        .click();
      await expect
        .poll(
          async () =>
            (await page.locator(`.module-${id.toLowerCase()}`).boundingBox())!
              .height,
        )
        .toBe(560);
      await page
        .getByRole("button", { name: `Свернуть ${id}`, exact: true })
        .click();
      await expect(page.locator(".workspace")).toHaveClass(/strip/);
    }
  }
});

test("M-04 long scope fill changes rendered pixels at desktop and mobile widths", async ({
  page,
}) => {
  // Keep readback on one raster backend; Chrome can otherwise switch after
  // repeated getImageData calls and change stroke antialiasing between reads.
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      type: string,
      options?: any,
    ) {
      return getContext.call(
        this,
        type as any,
        type === "2d" ? { ...options, willReadFrequently: true } : options,
      );
    } as typeof getContext;
  });
  await play(page);
  await page.evaluate(() => {
    const c = (window as any).visualizer.controller;
    const s = structuredClone(c.settings);
    s.oscilloscope.mode = "free";
    s.oscilloscope.windowMs = 100;
    s.oscilloscope.fill = false;
    c.setSettings(s);
  });
  await page
    .getByRole("button", { name: "Воспроизвести", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).visualizer.controller.audio.store.oscilloscope?.values
            .length ?? 0,
      ),
    )
    .toBeGreaterThan(4000);
  await page.getByRole("button", { name: "Пауза", exact: true }).click();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const canvas = page.locator(".module-oscilloscope canvas");
    await canvas.scrollIntoViewIfNeeded();
    const coverage = async () =>
      canvas.evaluate(async (el: HTMLCanvasElement) => {
        for (let i = 0; i < 3; i++)
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve()),
          );
        const ctx = el.getContext("2d")!;
        const { data } = ctx.getImageData(
          36,
          10,
          el.width - 48,
          el.height - 38,
        );
        let alpha = 0;
        for (let i = 3; i < data.length; i += 4) alpha += data[i];
        return alpha;
      });
    const setFill = async (fill: boolean) =>
      page.evaluate((fill) => {
        const c = (window as any).visualizer.controller;
        const s = structuredClone(c.settings);
        s.oscilloscope.fill = fill;
        c.setSettings(s);
      }, fill);
    // Complete a redraw after resizing before comparing the retained frame.
    await setFill(true);
    await coverage();
    await setFill(false);
    const empty = await coverage();
    await setFill(true);
    await expect.poll(coverage).toBeGreaterThan(empty);
    await setFill(false);
    await expect.poll(coverage).toBe(empty);
  }
});

test("M-05/M-06 actual plots measure rendered lanes and applied gain", async ({
  page,
}) => {
  await play(page);
  await page.evaluate(() => {
    const c = (window as any).visualizer.controller;
    const s = structuredClone(c.settings);
    s.waveform.lane1 = "S";
    s.waveform.lane2 = "M";
    s.waveform.bandHistory = "slow";
    s.stereometer.geometry = "ms";
    s.stereometer.gain = 2;
    s.analysis.trimDb = 6;
    c.setSettings(s);
  });
  await page
    .getByRole("button", { name: "Воспроизвести", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).visualizer.controller.audio.store.time,
      ),
    )
    .toBeGreaterThan(0.5);
  await page.getByRole("button", { name: "Пауза", exact: true }).click();
  await expect(await inspect(page, "waveform", 0.98, 0.45)).toHaveText(/^M ·/);
  await page.locator(".module-waveform canvas").press("Escape");
  await expect(await inspect(page, "waveform", 0.98, 0.99)).not.toHaveText(
    /^(S|M) ·/,
  );
  await expect(await inspect(page, "stereometer")).toContainText(
    "усиление 3.99×",
  );
});

test("M-08 paused theme redraws leave live latency and FPS samples unchanged", async ({
  page,
}) => {
  await play(page);
  const before = await page.evaluate(() => {
    const s = (window as any).visualizer.controller.audio.store;
    return {
      latency: [...s.latency],
      frames: [...s.frameTimes],
      render: [...s.renderTimes],
    };
  });
  expect(before.latency.length).toBeGreaterThan(0);
  for (let i = 0; i < 8; i++) {
    await page.evaluate(
      (dark) => {
        const c = (window as any).visualizer.controller;
        const s = structuredClone(c.settings);
        s.appearance.theme = dark ? "dark" : "light";
        c.setSettings(s);
      },
      i % 2 === 0,
    );
    await page.waitForTimeout(30);
  }
  const after = await page.evaluate(() => {
    const s = (window as any).visualizer.controller.audio.store;
    return {
      latency: [...s.latency],
      frames: [...s.frameTimes],
      render: [...s.renderTimes],
    };
  });
  expect(after).toEqual(before);
  await page.evaluate(() => {
    const c = (window as any).visualizer.controller;
    const s = structuredClone(c.settings);
    s.layout.enabled.oscilloscope = false;
    c.setSettings(s);
  });
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).visualizer.controller.audio.store.latency.length,
      ),
    )
    .toBe(0);
  await page
    .getByRole("button", { name: "Воспроизвести", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).visualizer.controller.audio.store.latency.length,
      ),
    )
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "Пауза", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 1000 });
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).visualizer.controller.audio.store.latency.length,
      ),
    )
    .toBe(0);
});

test("L-01/L-02 preset notices localize, resolve and dismiss while invalid imports stay atomic", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await page.getByRole("button", { name: "Пресеты", exact: true }).click();
  const file = page.getByRole("dialog").locator("input[type=file]");
  const before = await page.evaluate(() =>
    JSON.stringify((window as any).visualizer.controller.settings),
  );
  await file.setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from("{"),
  });
  await expect(page.getByRole("dialog")).toContainText("Неверный JSON");
  expect(
    await page.evaluate(() =>
      JSON.stringify((window as any).visualizer.controller.settings),
    ),
  ).toBe(before);
  await file.setInputFiles({
    name: "valid.json",
    mimeType: "application/json",
    buffer: Buffer.from(before),
  });
  await expect(page.getByRole("dialog")).not.toContainText("Неверный JSON");
  await file.setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from("{"),
  });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Скрыть уведомление", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toContainText("Неверный JSON");
  await page.getByRole("button", { name: "Закрыть панель" }).click();
  await page.evaluate(() => {
    const c = (window as any).visualizer.controller;
    c.notify("Старое сообщение");
    c.clear();
  });
  await expect(page.locator(".status-line")).not.toContainText(
    "Старое сообщение",
  );
});

test("L-03 diagnostics expose effective Economy caps while retaining preferences", async ({
  page,
}) => {
  await page.goto("/");
  await page.setViewportSize({ width: 360, height: 1000 });
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await page
    .getByRole("button", { name: "Производительность", exact: true })
    .click();
  await page
    .getByLabel("Частота отрисовки", { exact: true })
    .selectOption("60");
  await page.getByLabel("Предел DPR", { exact: true }).selectOption("2");
  await page.getByLabel("Экономный режим", { exact: true }).check();
  await expect(page.locator(".diagnostics")).toContainText(
    "Целевая частота: 30 FPS",
  );
  await expect(page.locator(".diagnostics")).toContainText(
    "Эффективный DPR: 1",
  );
  await expect(page.locator(".diagnostics")).toContainText("экономный режим");
  await expect(
    page.getByLabel("Частота отрисовки", { exact: true }),
  ).toHaveValue("60");
  await expect(page.getByLabel("Предел DPR", { exact: true })).toHaveValue("2");
});

test("L-01 skipping a duplicate resolves its notice; storage failure survives dismissal", async ({
  page,
}) => {
  await play(page);
  await page.evaluate(() => {
    const c = (window as any).visualizer.controller;
    c.add([c.queue.active.file]);
  });
  await page.getByRole("button", { name: /Очередь, 2/ }).click();
  await page.getByRole("button", { name: "Пропустить", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toContainText(
    "Возможный дубликат",
  );
  await page.getByRole("button", { name: "Закрыть панель" }).click();
  await page.evaluate(() => {
    const c = (window as any).visualizer.controller;
    Storage.prototype.setItem = () => {
      throw new DOMException("quota", "QuotaExceededError");
    };
    c.setSettings(c.settings);
    c.notify("Временное сообщение");
  });
  await page
    .getByRole("button", { name: "Скрыть уведомление", exact: true })
    .click();
  await expect(page.locator(".status-line")).toContainText(
    "Настройки не удалось сохранить",
  );
  await page.evaluate(() => (window as any).visualizer.controller.clear());
  await expect(page.locator(".status-line")).toContainText(
    "Настройки не удалось сохранить",
  );
});
