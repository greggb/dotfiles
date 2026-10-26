import { parseShell } from "./shell-lexer.ts";
import { gitInspectionViolation } from "./policy.ts";

type Decision = { action: "allow" | "nudge" | "block"; count: number; reason?: string };

export function createDelegationGuard({ nudgeAt = 6, blockAt }: { nudgeAt?: number; blockAt?: number } = {}) {
  let count = 0;
  return {
    reset() { count = 0; },
    onToolCall(toolName: string, nested: boolean, input?: { command?: unknown }): Decision {
      if (nested) return { action: "allow", count };
      if (toolName === "subagent") count = 0;
      if (toolName !== "bash" || typeof input?.command === "string" && isReadOnlyGit(input.command)) return { action: "allow", count };
      count++;
      if (blockAt !== undefined && count > blockAt) return { action: "block", count, reason: `Delegation guard: ${count} consecutive bash calls in the main agent since the last subagent call or user message. Delegate discovery to explore, command-running diagnosis (tests, logs, reproductions) to diagnose, and edits/test iteration to implementer via subagent. Read-only git commands are not counted. The counter resets after a subagent call or the next user message.` };
      return { action: count >= nudgeAt ? "nudge" : "allow", count };
    },
    reminder(count: number) {
      return `[delegation guard] ${count} consecutive main-agent bash calls. Consider handing broad discovery to explore or noisy test/log output to diagnose, or using targeted reads, when that keeps large output out of the main context.` + (blockAt === undefined ? "" : ` Blocked after ${blockAt}.`);
    },
  };
}

export function isReadOnlyGit(command: string): boolean {
  const parsed = parseShell(command);
  if (!parsed.ok || parsed.substitutions.length || parsed.background || parsed.commands[0]?.words[0] !== "git") return false;
  return parsed.commands.every(({ words, piped, assignments, redirects }) => {
    if (assignments.length || !redirects.every(({ op, target }) => target === "/dev/null" || [">&", "<&"].includes(op) && /^\d+$/.test(target))) return false;
    if (words[0] !== "git") return piped && isReadOnlyFilter(words);
    if (piped) return false;
    return gitInspectionViolation(words.slice(1)) === undefined;
  });
}

type TrimmedOutput = { trimmed: false; text: string } | { trimmed: true; head: string; tail: string; omittedBytes: number };

export function trimOutput(text: string, { limitBytes = 12 * 1024, headBytes = 2 * 1024, tailBytes = 8 * 1024 } = {}): TrimmedOutput {
  const bytes = Buffer.from(text);
  if (bytes.length <= limitBytes) return { text, trimmed: false };
  const headBudget = Math.min(headBytes, limitBytes, bytes.length);
  let headEnd = headBudget;
  while (headEnd > 0 && (bytes[headEnd] & 0xc0) === 0x80) headEnd--;
  const headLine = bytes.lastIndexOf(10, headEnd - 1);
  if (headEnd > 0 && headLine >= 0 && headLine + 1 >= headBudget / 2) headEnd = headLine + 1;
  const tailBudget = Math.min(tailBytes, limitBytes - headEnd, bytes.length - headEnd);
  let tailStart = bytes.length - tailBudget;
  while (tailStart < bytes.length && (bytes[tailStart] & 0xc0) === 0x80) tailStart++;
  if (tailStart > 0 && bytes[tailStart - 1] !== 10) {
    const tailLine = bytes.indexOf(10, tailStart);
    if (tailLine >= 0 && bytes.length - tailLine - 1 >= tailBudget / 2) tailStart = tailLine + 1;
  }
  const omittedBytes = tailStart - headEnd;
  return { trimmed: true, head: bytes.subarray(0, headEnd).toString(), tail: bytes.subarray(tailStart).toString(), omittedBytes };
}

function isReadOnlyFilter(words: string[]): boolean {
  const [name, ...args] = words;
  if (!["head", "tail", "wc", "grep", "cut", "sort", "uniq", "cat"].includes(name)) return false;
  let positional = 0, options = true;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (options && arg === "--") { options = false; continue; }
    if (options && arg.startsWith("-") && arg !== "-") {
      if (name === "sort" && (/^--output/.test(arg) || /^-[^-]*o/.test(arg))) return false;
      if (name === "tail" && (/^--follow/.test(arg) || /^-[^-]*[fF]/.test(arg))) return false;
      if (name === "uniq" && (/^--(?:skip-fields|skip-chars|check-chars)$/.test(arg) || /^-[^-]*[fsw]$/.test(arg))) index++;
    } else if (name === "uniq" && ++positional > 1) return false;
  }
  return true;
}
