import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const irreversibleCommands: { pattern: RegExp; reason: string }[] = [
  { pattern: /\bgit\b(?:\s+-C\s+\S+)?\s+push\b/, reason: "git push" },
  { pattern: /\bgit\b(?:\s+-C\s+\S+)?\s+(?:reset\s+--hard|clean\s+-\w*f)/, reason: "discards uncommitted work" },
  { pattern: /\bgh\s+(?:pr\s+(?:merge|close)|release\s+\w+|repo\s+(?:create|delete|edit|rename|archive))\b/, reason: "GitHub merge, release or repository change" },
  { pattern: /\b(?:kubectl|helm|terraform|pulumi)\b.*\b(?:apply|delete|destroy|install|upgrade|uninstall|rollout|scale|patch|replace|up)\b/, reason: "infrastructure change" },
  { pattern: /\b(?:npm|pnpm|yarn|uv|twine)\s+publish\b|\bdocker\s+push\b/, reason: "package or image publish" },
  { pattern: /\bmake\s+\S*deploy|\b(?:npm|pnpm|yarn)\s+(?:run\s+)?\S*deploy/, reason: "deploy" },
];

const externalWriteVerbs = /(?:^|_)(?:create|update|delete|remove|add|edit|transition|link|unlink|comment|close|reopen|share|upload|publish|deploy|send|set)(?:_|$)/;

export function approvalReason(toolName: string, input: unknown): string | undefined {
  if (toolName === "bash" && hasCommand(input)) {
    const { command } = input;
    return irreversibleCommands.find(({ pattern }) => pattern.test(command))?.reason;
  }
  if (toolName.startsWith("mcp__")) {
    const tool = toolName.split("__").at(-1)?.toLowerCase() ?? "";
    return externalWriteVerbs.test(tool) ? "external service write" : undefined;
  }
  return undefined;
}

export default function guard(pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    const reason = approvalReason(event.toolName, event.input);
    if (!reason) return undefined;
    if (!ctx.hasUI) return { block: true, reason: `${reason} needs interactive approval` };
    const summary = hasCommand(event.input) ? event.input.command : JSON.stringify(event.input);
    const approved = await ctx.ui.confirm(`Approve ${reason}?`, summary.slice(0, 2000), { signal: ctx.signal });
    return approved ? undefined : { block: true, reason: `User declined: ${reason}` };
  });
}

function hasCommand(input: unknown): input is { command: string } {
  return typeof input === "object" && input !== null && "command" in input && typeof input.command === "string";
}
