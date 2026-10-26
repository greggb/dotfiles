import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import { formatFooter, type FooterInput } from "./format.ts";

export default function (pi: ExtensionAPI) {
  let enabled = true;

  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode === "tui" && ctx.hasUI && enabled) installFooter(pi, ctx);
  });

  pi.registerCommand("footer", {
    description: "Toggle readable and built-in footer",
    handler: async (_args, ctx) => {
      if (ctx.mode !== "tui" || !ctx.hasUI) {
        ctx.ui.notify("The footer requires TUI mode", "info");
        return;
      }
      enabled = !enabled;
      if (enabled) installFooter(pi, ctx);
      else ctx.ui.setFooter(undefined);
      ctx.ui.notify(`${enabled ? "Readable" : "Built-in"} footer active`, "info");
    },
  });
}

function installFooter(pi: ExtensionAPI, ctx: ExtensionContext): void {
  ctx.ui.setFooter((tui, theme, footerData) => {
    let cached: ReturnType<typeof scanUsage> | undefined;
    let cachedLeaf: string | null | undefined;
    let cachedModel: string | undefined;
    const unsubscribe = footerData.onBranchChange(() => tui.requestRender());

    return {
      dispose: unsubscribe,
      invalidate() {},
      render(width: number): string[] {
        const leaf = ctx.sessionManager.getLeafId();
        const model = ctx.model;
        if (!cached || cachedLeaf !== leaf || cachedModel !== model?.id) {
          cached = scanUsage(ctx);
          cachedLeaf = leaf;
          cachedModel = model?.id;
        }
        const usage = ctx.getContextUsage();
        const input: FooterInput = {
          cwd: ctx.sessionManager.getCwd(),
          home: process.env.HOME || process.env.USERPROFILE,
          branch: footerData.getGitBranch(),
          sessionName: ctx.sessionManager.getSessionName(),
          model: model ? { name: model.name, id: model.id } : undefined,
          thinking: model?.reasoning ? pi.getThinkingLevel() : undefined,
          context: usage
            ? { tokens: usage.tokens, window: usage.contextWindow, percent: usage.percent }
            : model
              ? { tokens: null, window: model.contextWindow, percent: null }
              : undefined,
          ...cached,
        };
        const formatted = formatFooter(input, width);
        const ellipsis = theme.fg("dim", "...");
        const lines = [
          truncateToWidth(theme.fg("dim", formatted.location), width, ellipsis),
          truncateToWidth(
            formatted.segments
              .map((segment) => theme.fg(segment.tone, segment.text))
              .join(theme.fg("dim", "  ·  ")),
            width,
            ellipsis,
          ),
        ];
        const statuses = footerData.getExtensionStatuses();
        if (statuses.size > 0) {
          const text = Array.from(statuses.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([, status]) => status.replace(/[\r\n\t]/g, " ").replace(/ +/g, " ").trim())
            .join("  ");
          lines.push(truncateToWidth(text, width, ellipsis));
        }
        return lines;
      },
    };
  });
}

function scanUsage(ctx: ExtensionContext): Pick<FooterInput, "totals" | "cacheHitPercent"> {
  const totals: FooterInput["totals"] = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
  let cacheHitPercent: number | undefined;
  for (const entry of ctx.sessionManager.getEntries()) {
    let usage: unknown;
    let assistant = false;
    if (entry.type === "usage" || entry.type === "branch_summary" || entry.type === "compaction") {
      usage = entry.usage;
    } else if (entry.type === "message") {
      if (entry.message.role === "assistant") {
        usage = entry.message.usage;
        assistant = true;
      } else if (entry.message.role === "toolResult") {
        usage = entry.message.usage;
      }
    }
    if (!isUsage(usage)) continue;
    totals.input += usage.input;
    totals.output += usage.output;
    totals.cacheRead += usage.cacheRead;
    totals.cacheWrite += usage.cacheWrite;
    totals.cost += usage.cost.total;
    if (assistant) {
      const prompt = usage.input + usage.cacheRead + usage.cacheWrite;
      cacheHitPercent = prompt > 0 ? usage.cacheRead / prompt * 100 : undefined;
    }
  }
  return { totals, cacheHitPercent };
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
