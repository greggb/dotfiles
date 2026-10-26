import { spawn } from "node:child_process";
import type { ChildUsage } from "../runner.ts";

const chunks: Buffer[] = [];
for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
const scenario = Buffer.concat(chunks).toString("utf8");
function emit(value: unknown) { process.stdout.write(JSON.stringify(value) + "\n"); }
function assistant(text: string, stopReason = "stop", errorMessage?: string, usage?: ChildUsage) {
  emit({ type: "message_end", message: { role: "assistant", provider: "github-copilot", model: "gpt-6.1-sol", content: [{ type: "text", text }], stopReason, errorMessage, usage } });
}
const usage: ChildUsage = { input: 41000, output: 3000, cacheRead: 600000, cacheWrite: 2000, totalTokens: 646000,
  cost: { input: 0.02, output: 0.03, cacheRead: 0.005, cacheWrite: 0.005, total: 0.06 } };

if (scenario === "hang" || scenario === "descendant") {
  if (scenario === "descendant") {
    const descendant = spawn(process.execPath, ["-e", 'process.on("SIGTERM",()=>{});setInterval(()=>{},1000);process.stdout.write("READY\\n")'], { stdio: ["ignore", "pipe", "inherit"] });
    descendant.stdout?.once("data", () => process.stderr.write(`DESCENDANT:${descendant.pid}\n`));
    // Leader exits on TERM; the descendant deliberately does not.
  } else process.on("SIGTERM", () => {});
  process.stderr.write(`LEADER:${process.pid}\n`);
  setInterval(() => {}, 1000);
} else if (scenario === "busy") {
  setInterval(() => emit({ type: "message_update", assistantMessageEvent: { type: "thinking_delta", delta: "thinking" } }), 20);
} else if (scenario === "stall" || scenario === "toolhang" || scenario === "diagnosticstall") {
  emit({ type: "tool_execution_start", toolCallId: "c1", toolName: "read" });
  if (scenario !== "toolhang") emit({ type: "tool_execution_end", toolCallId: "c1", toolName: "read" });
  if (scenario === "diagnosticstall") {
    emit({ type: "turn_end" });
    emit({ type: "auto_retry_start", attempt: 1, maxAttempts: 3, errorMessage: "529 overloaded " + "x".repeat(2000) });
  }
  setInterval(() => {}, 1000);
} else if (scenario === "retryfail") {
  emit({ type: "auto_retry_start", attempt: 1, maxAttempts: 3, delayMs: 1, errorMessage: "529 overloaded" });
  emit({ type: "auto_retry_end", success: false, attempt: 3, finalError: "529 overloaded" });
  assistant("", "error", "529 overloaded");
} else if (scenario === "retryrecovered") {
  assistant("", "error", "529 overloaded");
  emit({ type: "auto_retry_start", attempt: 1, maxAttempts: 3, delayMs: 1, errorMessage: "529 overloaded" });
  emit({ type: "auto_retry_end", success: true, attempt: 2 });
  assistant("recovered answer");
} else if (scenario === "compactionfail") {
  emit({ type: "compaction_start", reason: "threshold" });
  emit({ type: "compaction_end", reason: "threshold", errorMessage: "summary failed" });
  assistant("", "error", "summary failed");
} else if (scenario === "usage" || scenario === "usagefailure") {
  assistant("", "error", "529 overloaded", usage);
  emit({ type: "auto_retry_start", attempt: 1, maxAttempts: 3, errorMessage: "529 overloaded" });
  emit({ type: "auto_retry_end", success: true, attempt: 2 });
  emit({ type: "message_end", message: { role: "toolResult", usage } });
  emit({ type: "message_end", message: { role: "assistant", provider: "github-copilot", model: "gpt-6.1-sol", usage: { ...usage, input: "invalid" } } });
  assistant("billed answer", scenario === "usage" ? "stop" : "error", scenario === "usage" ? undefined : "billed failure", usage);
} else if (scenario === "usageinvalid") {
  for (const invalid of [null, {}, { ...usage, output: -1 }, { ...usage, cost: {} }, { ...usage, totalTokens: "invalid" }]) {
    emit({ type: "message_end", message: { role: "assistant", provider: "github-copilot", model: "gpt-6.1-sol", usage: invalid } });
  }
  assistant("no valid usage");
} else if (scenario === "logstderr") {
  assistant("partial answer", "error", "stderr failure");
  process.stderr.write("🙂".repeat(20000));
} else if (scenario === "logring") {
  for (let index = 0; index < 20; index++) emit({ type: "fixture", index, text: "🙂".repeat(10) });
  assistant("partial answer", "error", "ring failure");
  process.stderr.write("diagnostic stderr\n");
} else if (scenario === "auth") {
  assistant("", "error", "Missing authentication for configured model");
} else if (scenario === "length") {
  assistant("partial answer", "length");
} else if (scenario === "exit") {
  process.stderr.write("startup failed\n"); process.exitCode = 7;
} else if (scenario === "invalid") {
  process.stdout.write("not json\n");
} else if (scenario === "oversize") {
  assistant("x".repeat(2 * 1024 * 1024));
} else if (scenario === "empty") {
  emit({ type: "session" });
} else if (scenario === "mismatch") {
  emit({ type: "message_end", message: { role: "assistant", provider: "wrong", model: "wrong", stopReason: "stop", content: [{ type: "text", text: "fallback" }] } });
} else if (scenario === "aborted") {
  assistant("partial"); emit({ type: "agent_settled", aborted: true });
} else {
  for (const type of ["thinking_delta", "thinking_delta", "toolcall_delta", "toolcall_delta"]) {
    emit({ type: "message_update", assistantMessageEvent: { type, delta: "private payload" } });
  }
  emit({ type: "tool_execution_start", toolName: "read", args: { path: "example" } });
  emit({ type: "tool_execution_start", toolName: "read" });
  emit({ type: "tool_execution_end", toolName: "read", isError: false, result: { content: [{ type: "text", text: "read result" }] } });
  for (let i = 0; i < 3; i++) emit({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "working" } });
  const providerIndex = process.argv.indexOf("--provider");
  const modelIndex = process.argv.indexOf("--model");
  emit({ type: "message_end", message: { role: "assistant", provider: process.argv[providerIndex + 1], model: process.argv[modelIndex + 1], stopReason: "stop", content: [{ type: "text", text: scenario === "large" ? "🙂".repeat(40000) : JSON.stringify(process.argv.slice(2)) + "\u2028answer" }] } });
}
