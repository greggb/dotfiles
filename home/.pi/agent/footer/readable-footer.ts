import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { footerSeparator, formatFooter, type FooterInput } from "./format.ts";
import { readGitStatus, type GitStatus } from "./git-status.ts";

export default function (pi: ExtensionAPI) {
  let enabled = true;
  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode === "tui" && ctx.hasUI && enabled) installFooter(pi, ctx);
  });
  pi.registerCommand("footer", {
    description: "Toggle compact and built-in status bar",
    handler: async (_args, ctx) => {
      if (ctx.mode !== "tui" || !ctx.hasUI) {
        ctx.ui.notify("The footer requires TUI mode", "info");
        return;
      }
      enabled = !enabled;
      if (enabled) installFooter(pi, ctx);
      else ctx.ui.setFooter(undefined);
      ctx.ui.notify(`${enabled ? "Compact" : "Built-in"} status bar active`, "info");
    },
  });
}

function installFooter(pi: ExtensionAPI, ctx: ExtensionContext): void {
  ctx.ui.setFooter((tui, theme, footerData) => {
    let cached: ReturnType<typeof scanUsage> | undefined;
    let cachedLeaf: string | null | undefined;
    let cachedModel: string | undefined;
    let git: GitStatus | undefined;
    let refreshing = false;
    let disposed = false;
    let ticks = 0;
    const refreshGit = async () => {
      if (refreshing || disposed) return;
      refreshing = true;
      const next = await readGitStatus(ctx.sessionManager.getCwd());
      refreshing = false;
      if (!disposed) { git = next; tui.requestRender(); }
    };
    const unsubscribe = footerData.onBranchChange(() => { void refreshGit(); tui.requestRender(); });
    const timer = setInterval(() => {
      if (++ticks % 10 === 0) void refreshGit();
      tui.requestRender();
    }, 1000);
    void refreshGit();

    return {
      dispose() {
        if (disposed) return;
        disposed = true;
        clearInterval(timer);
        unsubscribe();
      },
      invalidate() {},
      render(width: number): string[] {
        const leaf = ctx.sessionManager.getLeafId();
        const model = ctx.model;
        const modelKey = model ? `${model.provider}/${model.id}` : undefined;
        if (!cached || cachedLeaf !== leaf || cachedModel !== modelKey) {
          cached = scanUsage(ctx);
          cachedLeaf = leaf;
          cachedModel = modelKey;
        }
        const usage = ctx.getContextUsage();
        const retention = process.env.PI_CACHE_RETENTION === "long" ? "long" : "short";
        const input: FooterInput = {
          cwd: ctx.sessionManager.getCwd(),
          home: process.env.HOME || process.env.USERPROFILE,
          branch: footerData.getGitBranch(),
          git,
          sessionName: ctx.sessionManager.getSessionName(),
          model: model ? { name: model.name, id: model.id } : undefined,
          thinking: model?.reasoning ? pi.getThinkingLevel() : undefined,
          context: usage
            ? { tokens: usage.tokens, window: usage.contextWindow, percent: usage.percent }
            : model ? { tokens: null, window: model.contextWindow, percent: null } : undefined,
          totals: cached.totals,
          cache: cached.cache ? { ...cached.cache, lifetimeSeconds: model?.promptCache?.[retention] } : undefined,
          now: Date.now(),
        };
        const sections = formatFooter(input, width, visibleWidth);
        const ellipsis = theme.fg("dim", "...");
        const lines = [truncateToWidth(sections.map((section) => section.map((segment) => theme.fg(segment.tone, segment.text)).join(" ")).join(theme.fg("dim", footerSeparator)), width, ellipsis)];
        const statuses = footerData.getExtensionStatuses();
        if (statuses.size > 0) {
          const text = Array.from(statuses.entries()).sort(([a], [b]) => a.localeCompare(b))
            .map(([, status]) => status.replace(/[\r\n\t]/g, " ").replace(/ +/g, " ").trim()).join("  ");
          lines.push(truncateToWidth(text, width, ellipsis));
        }
        return lines;
      },
    };
  });
}

function scanUsage(ctx: ExtensionContext): Pick<FooterInput, "totals" | "cache"> {
  const totals: FooterInput["totals"] = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
  for (const entry of ctx.sessionManager.getEntries()) {
    let usage: unknown;
    if (entry.type === "usage" || entry.type === "branch_summary" || entry.type === "compaction") usage = entry.usage;
    else if (entry.type === "message" && (entry.message.role === "assistant" || entry.message.role === "toolResult")) usage = entry.message.usage;
    if (!isUsage(usage)) continue;
    totals.input += usage.input;
    totals.output += usage.output;
    totals.cacheRead += usage.cacheRead;
    totals.cacheWrite += usage.cacheWrite;
    totals.cost += usage.cost.total;
  }
  const branch = ctx.sessionManager.getBranch();
  for (let index = branch.length - 1; index >= 0; index--) {
    const entry = branch[index];
    let usage: unknown;
    if (entry.type === "usage" && entry.kind === "cache_warm" && entry.provider === ctx.model?.provider && entry.model === ctx.model?.id) usage = entry.usage;
    else if (entry.type === "message" && entry.message.role === "assistant") {
      const message = entry.message;
      if (message.provider === ctx.model?.provider && message.model === ctx.model?.id && message.stopReason !== "error" && message.stopReason !== "aborted") usage = message.usage;
    }
    const at = Date.parse(entry.timestamp);
    if (!isUsage(usage) || !Number.isFinite(at)) continue;
    const prompt = usage.input + usage.cacheRead + usage.cacheWrite;
    if (prompt > 0) return { totals, cache: { hitPercent: usage.cacheRead / prompt * 100, lastRequestAt: at } };
  }
  return { totals };
}

function isUsage(value: unknown): value is {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: { total: number };
} {
  return typeof value === "object" && value !== null
    && "input" in value && typeof value.input === "number"
    && "output" in value && typeof value.output === "number"
    && "cacheRead" in value && typeof value.cacheRead === "number"
    && "cacheWrite" in value && typeof value.cacheWrite === "number"
    && "cost" in value && typeof value.cost === "object" && value.cost !== null
    && "total" in value.cost && typeof value.cost.total === "number";
}
