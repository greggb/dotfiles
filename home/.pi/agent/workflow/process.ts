import { spawn } from "node:child_process";

export const OUTPUT_LIMIT = 24 * 1024;
export const MAX_TIMEOUT_MS = 600_000;

export function bounded(text: string, limit = OUTPUT_LIMIT): string {
  if (Buffer.byteLength(text) <= limit) return text;
  const marker = "\n[truncated]";
  const prefix = Buffer.from(text).subarray(0, Math.max(0, limit - Buffer.byteLength(marker))).toString("utf8");
  // A byte slice may end inside a multi-byte character.
  return prefix.replace(/\uFFFD$/, "") + marker;
}

export interface ProcessResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  error?: string;
}

export interface ProcessOptions {
  command: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  input?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  killGraceMs?: number;
  group?: boolean;
  onStdout?: (chunk: string) => void;
  captureStdout?: boolean;
}

export async function runProcess(options: ProcessOptions): Promise<ProcessResult> {
  if (options.signal?.aborted) return { exitCode: null, signal: null, stdout: "", stderr: "", error: "Cancelled before start" };
  const timeoutMs = Math.min(MAX_TIMEOUT_MS, Math.max(1, options.timeoutMs ?? MAX_TIMEOUT_MS));
  const group = options.group ?? true;
  return new Promise((resolve) => {
    const result: ProcessResult = { exitCode: null, signal: null, stdout: "", stderr: "" };
    const child = spawn(options.command, options.args, {
      cwd: options.cwd, env: options.env, detached: group, stdio: ["pipe", "pipe", "pipe"],
    });
    let exited = false;
    let closed = false;
    let stopping = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const send = (signal: NodeJS.Signals) => {
      if (!child.pid) return;
      try {
        if (group) process.kill(-child.pid, signal);
        else if (!exited) child.kill(signal);
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) {
          result.error = `${result.error ?? "Termination failed"}; ${String(error)}`;
        }
      }
    };
    const finish = () => {
      if (!closed || (stopping && killTimer)) return;
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abort);
      resolve(result);
    };
    const stop = (reason: string) => {
      if (stopping) return;
      stopping = true;
      result.error = reason;
      send("SIGTERM");
      // Keep escalation even if the leader exits: descendants may ignore TERM or hold pipes.
      killTimer = setTimeout(() => {
        send("SIGKILL");
        killTimer = undefined;
        finish();
      }, options.killGraceMs ?? 500);
    };
    const abort = () => stop("Cancelled");
    const timeout = setTimeout(() => stop(`Timed out after ${timeoutMs}ms`), timeoutMs);
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      if (options.captureStdout !== false) result.stdout = bounded(result.stdout + chunk);
      options.onStdout?.(chunk);
    });
    child.stderr.on("data", (chunk: string) => { result.stderr = bounded(result.stderr + chunk); });
    child.stdin.on("error", (error: Error) => {
      if (!stopping) result.error = `Child stdin: ${error.message}`;
    });
    child.on("error", (error) => { result.error = `Spawn failed: ${error.message}`; });
    child.on("exit", (code, signal) => {
      exited = true;
      result.exitCode = code;
      result.signal = signal;
    });
    child.on("close", () => {
      closed = true;
      finish();
    });
    child.stdin.end(options.input);
  });
}
