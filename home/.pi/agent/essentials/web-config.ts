import { readFile } from "node:fs/promises";

export async function readWebEndpoint(path: string, override?: string): Promise<string> {
  let endpoint = override;
  if (!endpoint) {
    let config: unknown;
    try {
      config = JSON.parse(await readFile(path, "utf8"));
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        throw new Error("Configure PI_WEB_ENDPOINT or the endpoint field in web.local.json");
      }
      throw error;
    }
    if (typeof config !== "object" || config === null || !("endpoint" in config) || typeof config.endpoint !== "string") {
      throw new Error("web.local.json must contain an endpoint string");
    }
    endpoint = config.endpoint;
  }
  const url = new URL(endpoint);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("The web endpoint must use HTTP or HTTPS");
  return url.href;
}
