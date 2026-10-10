import { test, expect } from "@playwright/test";

test("every settings control has a unique label target and mobile icon controls have names", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  const duplicateIds = await page
    .locator("dialog [id]")
    .evaluateAll((elements) => {
      const ids = elements.map((element) => element.id);
      return ids.filter((id, index) => ids.indexOf(id) !== index);
    });
  expect(duplicateIds).toEqual([]);
  await page.getByRole("button", { name: "Закрыть панель" }).click();
  await page.setViewportSize({ width: 360, height: 800 });
  await expect(
    page.getByRole("button", { name: "Добавить аудио", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Заморозить", exact: true }),
  ).toBeVisible();
});

// Black-box tests also run against dist/: production exposes no dev controller.
test("packaged primary path plays mandatory codecs through real visible controls", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const file of ["stereo16.wav", "stereo24.wav", "stereo.mp3"]) {
    await page.goto("/");
    await page
      .locator("input[type=file]")
      .first()
      .setInputFiles(`tests/fixtures/${file}`);
    await expect(
      page.getByRole("button", { name: "Воспроизвести", exact: true }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "Воспроизвести", exact: true })
      .click();
    await expect(page.locator(".module-waveform .sr-only")).toContainText(
      /RMS: 0\.[1-9]/,
    );
    await expect(page.locator(".module-stereometer .sr-only")).toContainText(
      /Корреляция: 0\./,
    );
    await expect(page.locator(".module-oscilloscope .sr-only")).toContainText(
      /Основная частота: \d+/,
    );
    await page.getByRole("button", { name: "Настройки", exact: true }).click();
    await page
      .getByRole("button", { name: "Производительность", exact: true })
      .click();
    await expect(page.locator(".diagnostics")).toContainText(
      "AudioWorklet + Worker",
    );
    await page.getByRole("button", { name: "Закрыть панель" }).click();
    await page.getByRole("button", { name: "Пауза", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Воспроизвести", exact: true }),
    ).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test("production canvases, theme, focus and mobile transport work without diagnostics hooks", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles("tests/fixtures/long.wav");
  await page
    .getByRole("button", { name: "Воспроизвести", exact: true })
    .click();
  await page.waitForTimeout(8500);
  await page.screenshot({
    path: `docs/screenshots/${test.info().project.name}-production-light-1440.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Тёмная тема" }).click();
  await page.screenshot({
    path: `docs/screenshots/${test.info().project.name}-production-dark-1440.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Развернуть Spectrum", exact: true })
    .click();
  await expect(page.locator(".module-spectrum")).toHaveClass(/focused/);
  await page.keyboard.press("Escape");
  await expect(page.locator(".module-spectrum")).not.toHaveClass(/focused/);
  await page.setViewportSize({ width: 360, height: 800 });
  for (const canvas of await page.locator("canvas").all()) {
    await canvas.scrollIntoViewIfNeeded();
    await page.waitForTimeout(120);
    expect(await canvas.evaluate((c) => c.width * c.height)).toBeGreaterThan(
      1000,
    );
  }
  await page.locator(".workspace-toolbar .text-action").first().click();
  await page.screenshot({
    path: `docs/screenshots/${test.info().project.name}-production-dark-360.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Светлая тема" }).click();
  // Theme redraw is intentionally frozen too; unfreeze briefly updates all visible canvases.
  await page.locator(".workspace-toolbar .text-action").first().click();
  for (const canvas of await page.locator("canvas").all()) {
    await canvas.scrollIntoViewIfNeeded();
    await page.waitForTimeout(120);
  }
  await page.locator(".workspace-toolbar .text-action").first().click();
  await page.screenshot({
    path: `docs/screenshots/${test.info().project.name}-production-light-360.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
