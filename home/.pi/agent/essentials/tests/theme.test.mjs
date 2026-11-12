import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const installed = join(process.env.PI_RUNTIME_DIR ?? "/opt/homebrew/opt/pi-coding-agent/libexec/lib", "node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/");
const { validateThemeJson } = await import(installed + "theme-schema.js");
const { THEME_TOKENS } = await import(installed + "theme-tokens.js");
const { loadThemeFromPath, setThemeJsonValidator, setRegisteredThemes, getResolvedThemeColors, getThemeExportColors } = await import(installed + "theme.js");
const path = fileURLToPath(new URL("../../themes/tokyo-night.json", import.meta.url));
setThemeJsonValidator(validateThemeJson);
const theme = loadThemeFromPath(path, "truecolor");
setRegisteredThemes([theme]);
const colors = getResolvedThemeColors("tokyo-night");

function luminance(hex) {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
  return channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
}

function contrast(foreground, background) {
  const light = luminance(foreground);
  const dark = luminance(background);
  return (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05);
}

test("selected Tokyo Night theme validates and renders every token in truecolor and 256 colors", async () => {
  const settings = JSON.parse(await readFile(new URL("../../settings.json", import.meta.url), "utf8"));
  assert.equal(settings.theme, theme.name);
  assert.equal(theme.name, "tokyo-night");
  assert.equal(theme.appearance, "dark");
  assert.equal(colors.text, "#c0caf5");
  assert.equal(colors.accent, "#7aa2f7");
  assert.equal(colors.thinkingHigh, "#bb9af7");
  for (const mode of ["truecolor", "256color"]) {
    const loaded = loadThemeFromPath(path, mode);
    for (const [name, descriptor] of Object.entries(THEME_TOKENS)) {
      const rendered = descriptor.slot === "background" ? loaded.bg(name, "sample") : loaded.fg(name, "sample");
      assert.ok(rendered.includes("sample"), `${mode}: ${name}`);
      assert.ok(rendered.startsWith(`\u001b[${descriptor.slot === "background" ? 48 : 38};${mode === "truecolor" ? 2 : 5};`));
    }
  }
});

test("body and footer text remain readable on the Night background and message panels", () => {
  const backgrounds = ["#1a1b26", ...["selectedBg", "userMessageBg", "customMessageBg", "toolPendingBg", "toolSuccessBg", "toolErrorBg"].map((token) => colors[token])];
  for (const token of ["text", "muted", "dim", "thinkingText"]) {
    for (const background of backgrounds) assert.ok(contrast(colors[token], background) >= 4.5, `${token} against ${background}`);
  }
  assert.ok(contrast(colors.searchMatchText, colors.searchMatchBg) >= 4.5);
});

test("thinking effort and bash modes have distinct borders and exports use Night backgrounds", () => {
  const levels = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
  const borders = levels.map((level) => theme.getThinkingBorderColor(level)("border"));
  assert.equal(new Set(borders).size, levels.length);
  assert.ok(!borders.includes(theme.getBashModeBorderColor()("border")));
  assert.deepEqual(getThemeExportColors("tokyo-night"), { pageBg: "#1a1b26", cardBg: "#16161e", infoBg: "#292e42" });
});
