import { randomBytes } from "node:crypto";
import { chmod, lstat, mkdir, readdir, realpath, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { repositoryContext } from "./context.ts";
import { bounded, runProcess } from "./process.ts";
import { getRole, timeoutFor, toolsFor, type Role } from "./roles.ts";
import { describeTool, type Phase, type Progress } from "./status.ts";

export interface Task { agent: string; task: string; cwd?: string }
export interface ChildUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number };
}
export interface TaskResult {
  agent: string;
  model: string;
  output: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stopReason?: string;
  error?: string;
  isError: boolean;
  usage?: ChildUsage;
  transcript?: string;
  transcriptError?: string;
}
export interface RunnerOptions {
  cwd: string;
  entry: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  stallMs?: number;
  killGraceMs?: number;
  logDir?: string;
  logLimit?: number;
  logBytes?: number;
  onProgress?: (index: number, progress: Progress) => void;
  context?: (cwd: string) => Promise<string>;
  skills?: string[];
}

const policy = fileURLToPath(new URL("./child-policy.ts", import.meta.url));
const MAX_RECORD = 1024 * 1024;
export const STALL_MS = 240_000;

export function childArgs(role: Role, entry: string, prompt: string, skills: string[]): string[] {
  return [entry, "--mode", "json", "-p", "--no-session", "--no-extensions", "--no-mcp",
    "--no-context-files", "--no-skills", "--no-prompt-templates", "--no-themes", "--no-approve",
    "--extension", policy, "--provider", role.provider, "--model", role.model,
    "--thinking", role.thinking, "--tools", toolsFor(role).join(","),
    ...skills.flatMap((skill) => ["--skill", skill]), "--append-system-prompt", prompt];
}

export async function runTasks(tasks: Task[], options: RunnerOptions): Promise<TaskResult[]> {
  if (tasks.length < 1 || tasks.length > 8) throw new Error("Supply 1 to 8 tasks");
  let next = 0;
  const results: TaskResult[] = [];
  async function worker() {
    while (next < tasks.length) {
      const index = next++;
      const task = tasks[index];
      if (task) results[index] = await runTask(task, index, options);
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, tasks.length) }, worker));
  return results;
}

async function runTask(task: Task, index: number, options: RunnerOptions): Promise<TaskResult> {
  let model = "unresolved";
  let started = Date.now();
  let lastEventAt = started;
  let activity = "starting";
  const progress = (phase: Phase = "running", error?: string) => options.onProgress?.(index, {
    phase, activity, elapsedMs: Date.now() - started, idleMs: Date.now() - lastEventAt,
    ...(error === undefined ? {} : { error }),
  });
  const updateActivity = (next: string) => {
    if (next === activity) return;
    activity = next;
    progress();
  };
  try {
    const role = getRole(task.agent);
    model = `${role.provider}/${role.model}`;
    if (!task.task.trim() || Buffer.byteLength(task.task) > 64 * 1024) throw new Error("Task must be nonempty and <=64 KiB");
    if (options.signal?.aborted) throw new Error("Cancelled before start");
    const cwd = await realpath(resolve(options.cwd, task.cwd ?? "."));
    const context = await (options.context ?? repositoryContext)(cwd);
    const skills = role.access === "write" ? options.skills ?? await userSkills() : [];
    const prompt = `${context}\n\nWorkflow child instructions (override global workflow/delegation guidance):\nYou are only the assigned child role, not the orchestrator. Do not delegate or launch other agents. Follow the role's narrower edit/test permissions even if global instructions request implementation, cleanup or verification. Your final response goes to the parent agent, not the human user: return a plain report. The shared instructions' Communication section (greeting, persona, humor) applies only to messages to the human user, so do not apply it here.\n\nAssigned role:\n${role.prompt}`;
    let output = "";
    let usage: ChildUsage | undefined;
    const lines: { text: string; bytes: number }[] = [];
    const logBytes = Math.min(MAX_RECORD, Math.max(0, Number.isFinite(options.logBytes) ? options.logBytes ?? MAX_RECORD : MAX_RECORD));
    let retainedBytes = 0;
    let droppedLines = 0;
    const retain = (line: string) => {
      const text = line.endsWith("\n") ? line : line + "\n";
      const bytes = Buffer.byteLength(text);
      if (bytes > logBytes) { droppedLines++; return; }
      while (retainedBytes + bytes > logBytes) {
        const oldest = lines.shift();
        if (oldest) { retainedBytes -= oldest.bytes; droppedLines++; }
      }
      lines.push({ text, bytes });
      retainedBytes += bytes;
    };
    let stopReason: string | undefined;
    let error: string | undefined;
    let pending = "";
    let pendingBytes = 0;
    let discarding = false;
    started = Date.now();
    lastEventAt = started;
    let lastActivity = "starting";
    const tools = new Map<string, { name: string; startedAt: number }>();
    let turns = 0; let toolCalls = 0; let retries = 0;
    let lastRetryError = "";
    let providerError: string | undefined;
    let messageError: string | undefined;
    let stallReason: string | undefined;
    const stallMs = options.stallMs ?? STALL_MS;
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, ...(options.signal ? [options.signal] : [])]);
    const summary = () => `${turns} turns, ${toolCalls} tool calls, ${retries} provider retries${lastRetryError ? `, last retry error: ${lastRetryError}` : ""}`;
    const consume = (line: string) => {
      retain(line);
      if (!line.trim()) return;
      let value: unknown;
      try { value = JSON.parse(line); }
      catch { error = "Invalid child JSON output"; return; }
      if (!record(value)) { error = "Invalid child event"; return; }
      lastEventAt = Date.now();
      lastActivity = bounded(typeof value.type === "string" ? value.type.replaceAll("_", " ") : "child event", 200);
      const toolName = bounded(typeof value.toolName === "string" ? value.toolName : "unknown", 128);
      const toolKey = typeof value.toolCallId === "string" ? value.toolCallId : typeof value.toolName === "string" ? value.toolName : "unknown";
      if (value.type === "turn_end") turns++;
      if (value.type === "tool_execution_start") {
        toolCalls++;
        tools.set(toolKey, { name: toolName, startedAt: lastEventAt });
        lastActivity = `tool ${toolName}`;
        updateActivity(describeTool(toolName, value.args, cwd));
      }
      if (value.type === "tool_execution_update") lastActivity = `tool ${toolName}`;
      if (value.type === "tool_execution_end") {
        tools.delete(toolKey);
        lastActivity = `tool ${toolName} done`;
        updateActivity("thinking");
      }
      if (value.type === "message_update" && record(value.assistantMessageEvent)) {
        const type = value.assistantMessageEvent.type;
        if (typeof type === "string") {
          lastActivity = type.startsWith("thinking") ? "thinking" : type.startsWith("text") ? "responding" : type.startsWith("toolcall") ? "preparing tool call" : lastActivity;
          if (type.startsWith("thinking")) updateActivity("thinking");
          else if (type.startsWith("text")) updateActivity("writing response");
          else if (type.startsWith("toolcall")) updateActivity("planning next step");
        }
      }
      if (value.type === "auto_retry_start") {
        retries++;
        if (typeof value.errorMessage === "string") lastRetryError = bounded(value.errorMessage, 500);
        const attempt = typeof value.attempt === "number" ? value.attempt : retries;
        const maxAttempts = typeof value.maxAttempts === "number" ? value.maxAttempts : "?";
        lastActivity = bounded(`provider retry ${attempt}/${maxAttempts}: ${lastRetryError}`, 200);
        updateActivity(`provider error, retry ${attempt}/${maxAttempts}`);
      }
      if (value.type === "auto_retry_end" && value.success === false) {
        providerError = bounded(`Provider retries exhausted: ${typeof value.finalError === "string" ? value.finalError : lastRetryError}`);
        error = providerError;
      }
      if (value.type === "compaction_start") {
        lastActivity = "compaction";
        updateActivity("compacting context");
      }
      if (value.type === "compaction_end" && typeof value.errorMessage === "string") error ??= bounded(`Compaction failed: ${value.errorMessage}`);
      if (value.type === "message_end" && record(value.message) && value.message.role === "assistant") {
        const message = value.message;
        if (isUsage(message.usage)) usage = sumUsage([usage, message.usage]);
        if (message.provider !== role.provider || message.model !== role.model) error = "Child model mismatch (no fallback allowed)";
        output = textContent(message.content);
        if (typeof message.stopReason === "string") stopReason = bounded(message.stopReason, 128);
        // Only the latest assistant error counts: Pi's auto-retry may have recovered.
        messageError = typeof message.errorMessage === "string" && message.errorMessage ? bounded(message.errorMessage) : undefined;
      }
      if (value.type === "agent_settled" && value.aborted === true) error = "Child aborted";
    };
    progress();
    const heartbeat = setInterval(() => progress(), 5000);
    const watchdog = setInterval(() => {
      const idle = Date.now() - lastEventAt;
      if (signal.aborted || tools.size || idle < stallMs) return;
      stallReason = bounded(`Stalled: no child activity for ${Math.floor(idle / 1000)}s with no tool running (last: ${lastActivity}; ${summary()}). Likely a hung provider stream or stuck process, not slow work.`);
      controller.abort();
    }, Math.min(1000, Math.max(10, stallMs / 4)));
    try {
      const processResult = await runProcess({
        command: process.execPath, args: childArgs(role, options.entry, prompt, skills), cwd,
        env: { ...process.env, PI_WORKFLOW_ROLE: role.name, PI_OFFLINE: "1" },
        input: task.task, signal, timeoutMs: options.timeoutMs ?? timeoutFor(role), killGraceMs: options.killGraceMs,
        captureStdout: false,
        onStdout(chunk) {
          // Split only LF, not Unicode separators; discard overlong records without retaining them.
          for (const part of chunk.split(/(?<=\n)/)) {
            if (!discarding) pendingBytes += Buffer.byteLength(part);
            if (!discarding && pendingBytes > MAX_RECORD) {
              droppedLines++;
              pending = ""; discarding = true; error = "Child JSON record exceeds 1 MiB";
            }
            if (!discarding) pending += part;
            if (part.endsWith("\n")) {
              if (!discarding) consume(pending);
              pending = ""; pendingBytes = 0; discarding = false;
            }
          }
        },
      });
      if (pending) consume(pending);
      error = stallReason ?? processResult.error ?? providerError ?? error ?? messageError;
      if (!stallReason && processResult.error?.startsWith("Timed out")) {
        const tool = tools.values().next().value;
        const activity = tool ? `still running tool ${tool.name} for ${Math.floor((Date.now() - tool.startedAt) / 1000)}s`
          : `child was still active (last activity ${Math.floor((Date.now() - lastEventAt) / 1000)}s ago: ${lastActivity})`;
        error = bounded(`${processResult.error}; ${activity}; ${summary()}. Genuine timeout: split or narrow the task.`);
      }
      if (stopReason === "error" || stopReason === "aborted") error ??= `Child stopReason: ${stopReason}`;
      if (processResult.exitCode !== 0) error ??= `Child exited ${processResult.exitCode ?? processResult.signal ?? "unknown"}`;
      if (!output.trim()) error ??= "Child produced no final assistant text";
      if (stopReason !== "stop" && stopReason !== "length") error ??= `Incomplete child response (${stopReason ?? "missing stopReason"})`;
      if (stopReason === "length") error ??= "Child reached model output limit";
      progress(error ? "failed" : "done", error);
      const result: TaskResult = { agent: task.agent, model, output, stderr: processResult.stderr, exitCode: processResult.exitCode,
        signal: processResult.signal, stopReason, error, isError: Boolean(error), ...(usage ? { usage } : {}) };
      if (result.isError && processResult.error !== "Cancelled before start" && !processResult.error?.startsWith("Spawn failed:")) {
        const logDir = options.logDir ?? join(homedir(), ".pi", "agent", "subagent-logs");
        try {
          result.transcript = await writeTranscript(result, task, cwd, started, droppedLines, lines.map((line) => line.text), logDir);
        } catch (error) {
          result.transcriptError = bounded(`transcript write failed: ${error instanceof Error ? error.message : String(error)}`);
        }
        try {
          await pruneTranscripts(logDir, options.logLimit ?? 20);
        } catch (error) {
          result.transcriptError ??= bounded(`transcript pruning failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      return result;
    } finally { clearInterval(heartbeat); clearInterval(watchdog); }
  } catch (error) {
    const message = bounded(error instanceof Error ? error.message : String(error));
    progress("failed", message);
    return { agent: task.agent, model, output: "", stderr: "", exitCode: null, signal: null,
      error: message, isError: true };
  }
}

export function sumUsage(items: Iterable<ChildUsage | undefined>): ChildUsage | undefined {
  let total: ChildUsage | undefined;
  for (const usage of items) {
    if (!usage) continue;
    total ??= { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
    total.input += usage.input;
    total.output += usage.output;
    total.cacheRead += usage.cacheRead;
    total.cacheWrite += usage.cacheWrite;
    total.totalTokens += usage.totalTokens;
    total.cost.input += usage.cost.input;
    total.cost.output += usage.cost.output;
    total.cost.cacheRead += usage.cost.cacheRead;
    total.cost.cacheWrite += usage.cost.cacheWrite;
    total.cost.total += usage.cost.total;
  }
  return total;
}

export function isUsage(value: unknown): value is ChildUsage {
  if (!record(value) || !record(value.cost)) return false;
  return [value.input, value.output, value.cacheRead, value.cacheWrite, value.totalTokens,
    value.cost.input, value.cost.output, value.cost.cacheRead, value.cost.cacheWrite, value.cost.total]
    .every((number) => typeof number === "number" && Number.isFinite(number) && number >= 0);
}

async function writeTranscript(result: TaskResult, task: Task, cwd: string, started: number, droppedLines: number, lines: string[], logDir: string): Promise<string> {
  const now = Date.now();
  const path = join(logDir, `${new Date(now).toISOString().replaceAll(":", "-")}-${task.agent}-${randomBytes(3).toString("hex")}.jsonl`);
  const header = { type: "subagent_failure", agent: task.agent, model: result.model, cwd, task: task.task,
    error: result.error, exitCode: result.exitCode, signal: result.signal, stopReason: result.stopReason ?? null,
    startedAt: new Date(started).toISOString(), durationMs: now - started, droppedLines };
  await mkdir(logDir, { recursive: true, mode: 0o700 });
  // mkdir's mode only applies on creation; a pre-existing directory must also be private.
  await chmod(logDir, 0o700);
  await writeFile(path, JSON.stringify(header) + "\n" + lines.join("") + JSON.stringify({ type: "stderr", text: result.stderr }) + "\n", { mode: 0o600, flag: "wx" });
  return path;
}

async function pruneTranscripts(logDir: string, limit: number): Promise<void> {
  const files: { path: string; mtimeMs: number }[] = [];
  for (const entry of await readdir(logDir, { withFileTypes: true })) {
    if (!entry.name.endsWith(".jsonl") || !entry.isFile()) continue;
    const path = join(logDir, entry.name);
    try {
      const stat = await lstat(path);
      if (stat.isFile()) files.push({ path, mtimeMs: stat.mtimeMs });
    } catch (error) { if (!missingFile(error)) throw error; }
  }
  files.sort((a, b) => b.mtimeMs - a.mtimeMs || b.path.localeCompare(a.path));
  for (const file of files.slice(Math.max(0, limit))) {
    try { await unlink(file.path); }
    catch (error) { if (!missingFile(error)) throw error; }
  }
}

function missingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textContent(content: unknown): string {
  if (!Array.isArray(content)) return "";
  let text = "";
  for (const part of content) {
    if (record(part) && part.type === "text" && typeof part.text === "string") text = bounded(text + part.text);
  }
  return text;
}

async function userSkills(): Promise<string[]> {
  const paths = new Set<string>();
  for (const root of [join(homedir(), ".agents", "skills"), join(homedir(), ".claude", "skills")]) {
    try {
      const entries = await readdir(root, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() || entry.isSymbolicLink()) paths.add(await realpath(join(root, entry.name)));
      }
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
  }
  return [...paths];
}
