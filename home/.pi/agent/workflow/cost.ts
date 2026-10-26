import { isUsage, sumUsage, type ChildUsage } from "./runner.ts";
import { formatTokens } from "./status.ts";

// Structural view of Pi session entries: only the fields cost accounting reads.
export interface CostEntry {
  type: string;
  kind?: string;
  usage?: unknown;
  message?: { role: string; model?: string; toolName?: string; usage?: unknown; details?: unknown };
}

export interface CostReport {
  total: ChildUsage | undefined;
  /** Usage per source label ("parent <model>", "<agent> <model>", "tool <name>", "other <kind>"). */
  sources: Map<string, ChildUsage>;
  /** Cost of each user prompt in order, including all parent, child and tool work it caused.
   * Usage before the first prompt (for example a branch summary) counts only in totals. */
  prompts: number[];
}

/*
 * Session branch                     Report source
 * ───────────────────────────────    ──────────────────────────────
 * user message                       starts the next prompt bucket
 * assistant message (usage)          parent <model>
 * subagent tool result               <agent> <model> per child result
 * other tool result with usage       tool <name>
 * usage / compaction / summary       other <kind or type>
 */
export function summarizeCost(entries: readonly CostEntry[]): CostReport {
  const sources = new Map<string, ChildUsage>();
  const prompts: number[] = [];
  const add = (label: string, usage: unknown) => {
    if (!isUsage(usage)) return;
    const total = sumUsage([sources.get(label), usage]);
    if (total) sources.set(label, total);
    if (prompts.length) prompts[prompts.length - 1] += usage.cost.total;
  };
  for (const entry of entries) {
    const message = entry.type === "message" ? entry.message : undefined;
    if (!message) {
      add(`other ${entry.type === "usage" ? entry.kind ?? "usage" : entry.type}`, entry.usage);
      continue;
    }
    if (message.role === "user") prompts.push(0);
    else if (message.role === "assistant") add(`parent ${message.model ?? "unknown"}`, message.usage);
    else if (message.role === "toolResult") {
      const children = message.toolName === "subagent" ? childUsage(message.details) : [];
      if (children.length) for (const child of children) add(`${child.agent} ${child.model}`, child.usage);
      else add(`tool ${message.toolName ?? "unknown"}`, message.usage);
    }
  }
  return { total: sumUsage(sources.values()), sources, prompts };
}

export function formatCostReport({ total, sources, prompts }: CostReport): string {
  if (!total) return "No recorded model usage on this branch yet.";
  const inputTokens = total.input + total.cacheRead + total.cacheWrite;
  const cacheShare = inputTokens ? Math.round((total.cacheRead / inputTokens) * 100) : 0;
  const lines = [
    `Branch cost ${money(total.cost.total)} over ${prompts.length} prompt${prompts.length === 1 ? "" : "s"}. ` +
      `Cache reads ${cacheShare}% of input tokens; cache writes ${money(total.cost.cacheWrite)}, output ${money(total.cost.output)}.`,
  ];
  for (const [label, usage] of [...sources].sort(([, a], [, b]) => b.cost.total - a.cost.total)) {
    lines.push(`${label}: ${money(usage.cost.total)} · ${formatTokens(usage.input)} in, ${formatTokens(usage.output)} out, ` +
      `${formatTokens(usage.cacheRead)} cache read, ${formatTokens(usage.cacheWrite)} cache write`);
  }
  const costliest = prompts.map((cost, index) => ({ cost, index })).sort((a, b) => b.cost - a.cost).slice(0, 3);
  if (costliest.length) lines.push(`Last prompt ${money(prompts.at(-1) ?? 0)}. Costliest prompts: ${costliest.map(({ cost, index }) => `#${index + 1} ${money(cost)}`).join(", ")}.`);
  return lines.join("\n");
}

function childUsage(details: unknown): { agent: string; model: string; usage: ChildUsage }[] {
  if (!record(details) || !Array.isArray(details.results)) return [];
  return details.results.flatMap((result: unknown) =>
    record(result) && typeof result.agent === "string" && typeof result.model === "string" && isUsage(result.usage)
      ? [{ agent: result.agent, model: result.model, usage: result.usage }] : []);
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function money(value: number): string {
  return `$${value.toFixed(2)}`;
}
