export interface FooterInput {
  cwd: string;
  home?: string;
  branch: string | null;
  sessionName?: string;
  model?: { name: string; id: string };
  thinking?: string;
  context?: { tokens: number | null; window: number; percent: number | null };
  totals: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    cost: number;
  };
  cacheHitPercent?: number;
}

interface Segment {
  text: string;
  tone: "dim" | "warning" | "error";
}

export function formatFooter(
  input: FooterInput,
  width: number,
): { location: string; segments: Segment[] } {
  const modelName = input.model?.name || input.model?.id || "no model";
  const thinking = input.thinking === undefined
    ? ""
    : input.thinking === "off"
      ? ", thinking off"
      : `, ${input.thinking} thinking`;
  const percent = input.context?.percent ?? null;
  const model: Segment = { text: modelName + thinking, tone: "dim" };
  const context: Segment = {
    text: percent === null
      ? "context recalculating"
      : `context ${Math.round(percent)}% of ${formatTokens(input.context?.window ?? 0)}`,
    tone: percent !== null && percent > 90
      ? "error"
      : percent !== null && percent > 70
        ? "warning"
        : "dim",
  };
  const { input: tokensIn, output, cacheRead, cacheWrite, cost } = input.totals;
  const hasUsage = tokensIn + output + cacheRead + cacheWrite > 0;
  const shortTokens = `${formatTokens(tokensIn)} in, ${formatTokens(output)} out`;
  const cache = cacheRead + cacheWrite > 0 && input.cacheHitPercent !== undefined
    ? `, ${Math.round(input.cacheHitPercent)}% cached`
    : "";
  const tokens: Segment = {
    text: `${formatTokens(tokensIn)} tokens in, ${formatTokens(output)} out${cache}`,
    tone: "dim",
  };
  let segments = [model, context];
  if (hasUsage) segments.push(tokens);
  if (cost > 0) segments.push({ text: `$${cost.toFixed(2)} spent`, tone: "dim" });

  if (lineLength(segments) > width && hasUsage) tokens.text = shortTokens;
  if (lineLength(segments) > width && cost > 0) segments.pop();
  if (lineLength(segments) > width) segments = segments.filter((segment) => segment !== tokens);
  if (lineLength(segments) > width) model.text = modelName;

  let location = formatCwd(input.cwd, input.home);
  if (input.branch) location += ` on ${input.branch}`;
  if (input.sessionName) location += ` · ${input.sessionName}`;
  return { location, segments };
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

function lineLength(segments: Segment[]): number {
  return segments.map((segment) => segment.text).join("  ·  ").length;
}
