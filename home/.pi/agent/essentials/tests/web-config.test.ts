import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { readWebEndpoint } from "../web-config.ts";

test("web endpoint comes from private configuration or an explicit environment override", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "pi-web-config-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, "web.local.json");
  await assert.rejects(readWebEndpoint(path), /Configure PI_WEB_ENDPOINT/);
  assert.equal(await readWebEndpoint(path, "https://override.example.test/v1/messages"), "https://override.example.test/v1/messages");
  await writeFile(path, JSON.stringify({ endpoint: "https://gateway.example.test/v1/messages" }));
  assert.equal(await readWebEndpoint(path), "https://gateway.example.test/v1/messages");
  await writeFile(path, JSON.stringify({ endpoint: 123 }));
  await assert.rejects(readWebEndpoint(path), /endpoint string/);
  await assert.rejects(readWebEndpoint(path, "file:///private/config"), /HTTP or HTTPS/);
});
