import assert from "node:assert/strict";
import { test } from "node:test";
import { formatReply, parseReply } from "../web-reply.ts";

test("search replies keep the answer, sources, and priced usage", () => {
  const reply = parseReply({
    content: [
      { type: "server_tool_use", id: "s1", name: "web_search", input: { query: "python" } },
      { type: "web_search_tool_result", tool_use_id: "s1", content: [
        { type: "web_search_result", url: "https://python.org/downloads", title: "Downloads" },
        { type: "web_search_result", url: "https://blog.python.org" },
      ] },
      { type: "text", text: "Python 3.13.18 " },
      { type: "text", text: "is the latest." },
    ],
    usage: { input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, server_tool_use: { web_search_requests: 1 } },
  });
  assert.equal(reply.text, "Python 3.13.18 is the latest.");
  assert.deepEqual(reply.sources, [
    { url: "https://python.org/downloads", title: "Downloads" },
    { url: "https://blog.python.org", title: "https://blog.python.org" },
  ]);
  assert.equal(reply.usage.totalTokens, 1100);
  assert.ok(Math.abs(reply.usage.cost.total - (0.001 + 0.0005 + 0.01)) < 1e-9);
  assert.match(formatReply(reply), /Sources:\n- Downloads: https:\/\/python.org\/downloads/);
});

test("fetch results and tool errors are reported", () => {
  const reply = parseReply({
    content: [
      { type: "web_fetch_tool_result", content: { type: "web_fetch_result", url: "https://example.com/doc" } },
      { type: "web_fetch_tool_result", content: { type: "web_fetch_tool_error", error_code: "url_not_accessible" } },
    ],
    usage: {},
  });
  assert.deepEqual(reply.sources, [{ url: "https://example.com/doc", title: "https://example.com/doc" }]);
  assert.deepEqual(reply.errors, ["web_fetch_tool_result: url_not_accessible"]);
  assert.match(formatReply(reply), /^\(no answer\)/);
  assert.equal(reply.usage.cost.total, 0);
});

test("malformed bodies parse to an empty reply", () => {
  assert.deepEqual(parseReply(null).sources, []);
  assert.equal(parseReply({ content: "nope" }).text, "");
});
