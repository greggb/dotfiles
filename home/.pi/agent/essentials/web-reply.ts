import type { Usage } from "@earendil-works/pi-ai";

export type Source = { url: string; title: string };
export type Reply = { text: string; sources: Source[]; errors: string[]; usage: Usage };

const haikuPrice = { input: 1e-6, output: 5e-6, cacheRead: 0.1e-6, cacheWrite: 1.25e-6, search: 0.01 };

export function parseReply(body: unknown): Reply {
  const blocks = isRecord(body) && Array.isArray(body.content) ? body.content.filter(isRecord) : [];
  const text = blocks.flatMap((block) => block.type === "text" && typeof block.text === "string" ? [block.text] : []).join("").trim();
  const sources: Source[] = [];
  const errors: string[] = [];
  for (const block of blocks) {
    const result = block.content;
    if (block.type !== "web_search_tool_result" && block.type !== "web_fetch_tool_result") continue;
    for (const item of Array.isArray(result) ? result.filter(isRecord) : isRecord(result) ? [result] : []) {
      if (typeof item.error_code === "string") errors.push(`${block.type}: ${item.error_code}`);
      else if (typeof item.url === "string") sources.push({ url: item.url, title: typeof item.title === "string" ? item.title : item.url });
    }
  }
  return { text, sources, errors, usage: usageOf(isRecord(body) ? body.usage : undefined) };
}

export function formatReply({ text, sources, errors }: Reply): string {
  const lines = [text || "(no answer)"];
  if (sources.length) lines.push("", "Sources:", ...sources.slice(0, 10).map(({ title, url }) => `- ${title}: ${url}`));
  if (errors.length) lines.push("", "Tool errors:", ...errors.map((error) => `- ${error}`));
  return lines.join("\n");
}

function usageOf(raw: unknown): Usage {
  const count = (key: string) => isRecord(raw) && typeof raw[key] === "number" ? raw[key] : 0;
  const serverTools = isRecord(raw) && isRecord(raw.server_tool_use) ? raw.server_tool_use : {};
  const searches = typeof serverTools.web_search_requests === "number" ? serverTools.web_search_requests : 0;
  const input = count("input_tokens"), output = count("output_tokens");
  const cacheRead = count("cache_read_input_tokens"), cacheWrite = count("cache_creation_input_tokens");
  const cost = {
    input: input * haikuPrice.input + searches * haikuPrice.search,
    output: output * haikuPrice.output,
    cacheRead: cacheRead * haikuPrice.cacheRead,
    cacheWrite: cacheWrite * haikuPrice.cacheWrite,
    total: 0,
  };
  cost.total = cost.input + cost.output + cost.cacheRead + cost.cacheWrite;
  return { input, output, cacheRead, cacheWrite, totalTokens: input + output + cacheRead + cacheWrite, cost };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
