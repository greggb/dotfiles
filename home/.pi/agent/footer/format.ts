import type { GitStatus } from "./git-status.ts";

export interface FooterInput {
  cwd: string;
  home?: string;
  branch: string | null;
  git?: GitStatus;
  sessionName?: string;
  model?: { name: string; id: string };
  thinking?: string;
  context?: { tokens: number | null; window: number; percent: number | null };
  totals: { input: number; output: number; cacheRead: number; cacheWrite: number; cost: number };
  cache?: { hitPercent?: number; lastRequestAt?: number; lifetimeSeconds?: number };
  now: number;
}

interface Segment {
  text: string;
  tone: "accent" | "customMessageLabel" | "muted" | "dim" | "success" | "warning" | "error";
}

type Section = Segment[];
export const footerSeparator = " | ";

export function formatFooter(input: FooterInput, width: number, measure: (text: string) => number): Section[] {
  const lineWidth = (sections: Section[]) => measure(sections.map((section) => section.map((segment) => segment.text).join(" ")).join(footerSeparator));
  const modelName = input.model?.name || input.model?.id || "no model";
  const model: Section = [{ text: `[${modelName}${input.thinking === undefined ? "" : ` · ${input.thinking}`}]`, tone: "accent" }];
  const cwd = formatCwd(input.cwd, input.home);
  const project: Section = [{ text: cwd.split("/").filter(Boolean).at(-1) || "/", tone: "dim" }];
  const git = gitSegments(input);
  const percent = input.context?.percent ?? null;
  const contextText = (barWidth: number, showCapacity: boolean) => {
    if (percent === null) return "ctx ?";
    const filled = Math.round(Math.max(0, Math.min(100, percent)) / 100 * barWidth);
    const bar = barWidth > 0 ? `${"▰".repeat(filled)}${"▱".repeat(barWidth - filled)} ` : "";
    const capacity = showCapacity && input.context ? ` /${formatTokens(input.context.window)}` : "";
    return `ctx ${bar}${Math.round(percent)}%${capacity}`;
  };
  const context: Section = [{ text: contextText(10, true), tone: percent === null ? "dim" : percent > 90 ? "error" : percent > 70 ? "warning" : "success" }];
  const cache: Section = [cacheSegment(input)];
  const { input: tokensIn, output, cacheRead, cacheWrite, cost } = input.totals;
  const traffic: Section = [{ text: `↑${formatTokens(tokensIn)} ↓${formatTokens(output)}`, tone: "muted" }];
  const estimate: Section = [{ text: `~$${cost.toFixed(2)}`, tone: "muted" }];
  const session: Section = input.sessionName ? [{ text: input.sessionName, tone: "dim" }] : [];
  let sections = [model, project, git, context, cache];
  if (cost > 0) sections.push(estimate);
  if (tokensIn + output + cacheRead + cacheWrite > 0) sections.push(traffic);
  if (session.length) sections.push(session);
  sections = sections.filter((section) => section.length > 0);
  for (const optional of [session, traffic, project]) {
    if (lineWidth(sections) > width) sections = sections.filter((section) => section !== optional);
  }
  if (lineWidth(sections) > width) context[0].text = contextText(10, false);
  if (lineWidth(sections) > width) context[0].text = contextText(5, false);
  if (lineWidth(sections) > width) context[0].text = contextText(0, false);
  if (lineWidth(sections) > width) sections = sections.filter((section) => section !== estimate);
  if (lineWidth(sections) > width) model[0].text = `[${modelName}]`;
  if (lineWidth(sections) > width) cache[0] = cacheSegment(input, false);
  if (lineWidth(sections) > width) {
    for (const segment of git.slice(1)) segment.text = segment.text.replace(/\d+$/, "");
  }
  return sections;
}

function gitSegments(input: FooterInput): Section {
  const branch = input.git?.branch ?? input.branch;
  if (!branch) return [];
  const segments: Section = [{ text: ` ${branch}`, tone: "customMessageLabel" }];
  const git = input.git;
  if (!git) return segments;
  if (git.ahead) segments.push({ text: `⇡${git.ahead}`, tone: "accent" });
  if (git.behind) segments.push({ text: `⇣${git.behind}`, tone: "accent" });
  if (git.staged) segments.push({ text: `●${git.staged}`, tone: "success" });
  if (git.modified) segments.push({ text: `✚${git.modified}`, tone: "warning" });
  if (git.untracked) segments.push({ text: `…${git.untracked}`, tone: "error" });
  if (git.staged + git.modified + git.untracked === 0) segments.push({ text: "✔", tone: "success" });
  return segments;
}

function cacheSegment(input: FooterInput, showHitRate = true): Segment {
  const cache = input.cache;
  let text = showHitRate && cache?.hitPercent !== undefined ? `cache ${Math.round(cache.hitPercent)}%` : "cache";
  if (cache?.lastRequestAt === undefined) return { text: `${text} -`, tone: "dim" };
  const elapsed = Math.max(0, (input.now - cache.lastRequestAt) / 1000);
  if (cache.lifetimeSeconds !== undefined) {
    const remaining = Math.ceil(cache.lifetimeSeconds - elapsed);
    if (remaining <= 0) return { text: `${text} cold`, tone: "warning" };
    return { text: `${text} ~${formatDuration(remaining)} left`, tone: remaining <= 60 ? "warning" : "dim" };
  }
  return { text: `${text} ${formatDuration(Math.floor(elapsed))} ago`, tone: "dim" };
}

export function formatDuration(seconds: number): string {
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)}h${Math.floor(seconds % 3600 / 60)}m`;
  if (seconds >= 60) return `${Math.floor(seconds / 60)}m${seconds % 60}s`;
  return `${seconds}s`;
}

export function formatTokens(n: number): string {
  if (n < 1_000) return n.toString();
  if (n < 10_000) return `${(n / 1_000).toFixed(1)}k`;
  if (n < 1_000_000) return `${Math.round(n / 1_000)}k`;
  if (n < 10_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  return `${Math.round(n / 1_000_000)}M`;
}

export function formatCwd(cwd: string, home?: string): string {
  if (!home) return cwd;
  const base = home.replace(/\/+$/, "");
  if (cwd === home || cwd === base) return "~";
  return cwd.startsWith(`${base}/`) ? `~/${cwd.slice(base.length + 1)}` : cwd;
}
