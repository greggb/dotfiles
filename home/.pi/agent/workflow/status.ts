import { isAbsolute, relative, resolve, sep } from "node:path";
import type { ChildUsage } from "./runner.ts";

export type Phase = "queued" | "running" | "done" | "failed";
export interface Progress {
  phase: Phase;
  activity: string;
  elapsedMs: number;
  idleMs: number;
  error?: string;
}

export function formatDuration(ms: number): string {
  const seconds = Math.floor(Math.max(0, Number.isFinite(ms) ? ms : 0) / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

export function formatTokens(tokens: number): string {
  if (tokens < 1000) return String(tokens);
  const divisor = tokens >= 1_000_000 ? 1_000_000 : 1000;
  return `${Number((tokens / divisor).toFixed(1))}${divisor === 1000 ? "k" : "M"}`;
}

export function formatUsage(usage: ChildUsage | undefined): string {
  if (!usage) return "";
  return ` · ${formatTokens(usage.input)} in, ${formatTokens(usage.output)} out, ${formatTokens(usage.cacheRead)} cached${usage.cost.total ? `, $${usage.cost.total.toFixed(2)}` : ""}`;
}

export function describeTool(name: string, args: unknown, cwd: string): string {
  const input = typeof args === "object" && args !== null && !Array.isArray(args) ? args : {};
  const path = "path" in input && typeof input.path === "string" ? input.path : ".";
  const pattern = "pattern" in input && typeof input.pattern === "string" ? input.pattern : "";
  if (name === "read") return `reading ${displayPath(path, cwd)}`;
  if (name === "edit" || name === "write") return `editing ${displayPath(path, cwd)}`;
  if (name === "bash") {
    const command = "command" in input && typeof input.command === "string" ? input.command.split(/[\r\n]/)[0] ?? "" : "";
    return `running ${shorten(command || "command", 40)}`;
  }
  if (name === "grep") return `searching for "${shorten(pattern, 30)}"`;
  if (name === "find") return `finding ${singleLine(pattern || ".")}`;
  if (name === "ls") return `listing ${displayPath(path, cwd)}`;
  if (name === "git_inspect") {
    const operation = "operation" in input && typeof input.operation === "string" ? input.operation : "inspect";
    return `git ${singleLine(operation)}${"path" in input && typeof input.path === "string" && input.path ? ` ${displayPath(input.path, cwd)}` : ""}`;
  }
  return `using ${singleLine(name)}`;
}

export function formatLine(agent: string, label: string, p: Progress): string {
  const who = `${singleLine(agent)} (${singleLine(label)})`;
  if (p.phase === "queued") return `${who} · queued`;
  if (p.phase === "done") return `${who} · done in ${formatDuration(p.elapsedMs)}`;
  if (p.phase === "failed") return `${who} · failed after ${formatDuration(p.elapsedMs)}: ${shortError(p.error, 60)}`;
  return `${who} · ${formatDuration(p.elapsedMs)} · ${singleLine(p.activity)}${p.idleMs >= 30_000 ? ` (quiet ${formatDuration(p.idleMs)})` : ""}`;
}

export function formatFooter(entries: { agent: string; label: string; progress: Progress }[]): string {
  return entries.map(({ agent, progress: p }) => {
    const who = singleLine(agent);
    if (p.phase === "queued") return `… ${who} queued`;
    if (p.phase === "done") return `✓ ${who} ${formatDuration(p.elapsedMs)}`;
    if (p.phase === "failed") return `✗ ${who} failed: ${shortError(p.error, 30)}`;
    return `⏳ ${who} · ${formatDuration(p.elapsedMs)} · ${shorten(p.activity, 32)}`;
  }).join("  |  ");
}

function displayPath(path: string, cwd: string): string {
  const local = relative(resolve(cwd), resolve(cwd, path));
  const shown = singleLine(local !== ".." && !local.startsWith(`..${sep}`) && !isAbsolute(local) ? local || "." : path);
  return shown.length > 40 ? `…/${shown.split(/[\\/]/).filter(Boolean).slice(-2).join("/")}` : shown;
}

function singleLine(text: string): string {
  return text.replaceAll("\u2014", "-").replace(/\s+/g, " ").trim();
}

function shorten(text: string, limit: number): string {
  const line = singleLine(text);
  return line.length > limit ? line.slice(0, limit - 1).trimEnd() + "…" : line;
}

function shortError(error: string | undefined, limit: number): string {
  return shorten((error ?? "unknown error").split(/[;(\r\n]/)[0] ?? "", limit);
}
