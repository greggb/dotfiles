import { join } from "node:path";
import { Type, type TextContent } from "@earendil-works/pi-ai";
import { defineTool, getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readWebEndpoint } from "./web-config.ts";
import { formatReply, parseReply, type Reply } from "./web-reply.ts";
const model = "claude-haiku-4-5";

async function askWithServerTool(prompt: string, tool: Record<string, unknown>, signal: AbortSignal | undefined, beta?: string): Promise<Reply> {
  const key = process.env.GROVE_API_KEY;
  if (!key) throw new Error("GROVE_API_KEY is not set");
  const endpoint = await readWebEndpoint(join(getAgentDir(), "web.local.json"), process.env.PI_WEB_ENDPOINT);
  const response = await fetch(endpoint, {
    method: "POST",
    signal,
    headers: { "content-type": "application/json", "anthropic-version": "2023-06-01", "x-api-key": key, ...(beta ? { "anthropic-beta": beta } : {}) },
    body: JSON.stringify({ model, max_tokens: 2048, tools: [tool], messages: [{ role: "user", content: prompt }] }),
  });
  if (!response.ok) throw new Error(`AI Gateway ${response.status}: ${(await response.text()).slice(0, 500)}`);
  return parseReply(await response.json());
}

function toolResult(reply: Reply) {
  const content: TextContent[] = [{ type: "text", text: formatReply(reply) }];
  return { content, details: { sources: reply.sources }, usage: reply.usage };
}

const webSearch = defineTool({
  name: "web_search",
  label: "Web search",
  description: "Search the public web and get a concise answer with source URLs. Use for current docs, releases, changelogs, and error messages. Use Glean for MongoDB-internal knowledge.",
  parameters: Type.Object({ query: Type.String({ description: "What to find out, phrased as a question or search query" }) }),
  async execute(_id, { query }, signal) {
    const prompt = `Search the web and answer: ${query}\nBe concise and specific: versions, dates, exact names, URLs. Say so if results are inconclusive.`;
    return toolResult(await askWithServerTool(prompt, { type: "web_search_20250305", name: "web_search", max_uses: 3 }, signal));
  },
});

const webFetch = defineTool({
  name: "web_fetch",
  label: "Web fetch",
  description: "Fetch a public URL (HTML or PDF) and extract what the prompt asks for. Cannot reach corp-only or authenticated pages.",
  parameters: Type.Object({
    url: Type.String({ description: "Public http(s) URL" }),
    prompt: Type.String({ description: "What to extract from the page; ask for exact code, commands, or text when needed" }),
  }),
  async execute(_id, { url, prompt }, signal) {
    const request = `Fetch ${url} and answer from its content: ${prompt}\nQuote exact code, commands, and option names verbatim.`;
    return toolResult(await askWithServerTool(request, { type: "web_fetch_20250910", name: "web_fetch", max_uses: 2, max_content_tokens: 60_000 }, signal, "web-fetch-2025-09-10"));
  },
});

export default function web(pi: ExtensionAPI) {
  pi.registerTool(webSearch);
  pi.registerTool(webFetch);
}
