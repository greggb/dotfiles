import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseShell } from "./shell-lexer.ts";

export interface Hints { readOnlyHint?: boolean; destructiveHint?: boolean; openWorldHint?: boolean }
export interface PolicyCall {
  name: string;
  input: Record<string, unknown>;
  cwd: string;
  hints?: Hints;
}
export interface Decision { action: "allow" | "deny" | "confirm"; reason: string }

// Mirrors the normalizePath options in Pi's tools/path-utils.js (checked by
// tests/pi-api.test.mjs against the installed runtime). Lexical only,
// deliberately not called canonicalization: symlink resolution needs filesystem I/O.
export function resolveToolPath(path: string, cwd: string): string {
  function normalize(input: string, tool: boolean): string {
    let value = tool ? input.replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, " ").replace(/^@/, "") : input;
    if (value === "~") return homedir();
    if (value.startsWith("~/")) return join(homedir(), value.slice(2));
    if (value.startsWith("file://")) value = fileURLToPath(value);
    return value;
  }
  return resolve(normalize(cwd, false), normalize(path, true));
}

export function isPrivatePiPath(path: string): boolean {
  const agent = join(homedir(), ".pi", "agent");
  const backups = join(homedir(), ".pi", "backups");
  return path === backups || path.startsWith(`${backups}/`) ||
    ["models.json", "mcp.json", "models-store.json", "sessions"].some((name) => path === join(agent, name) || path.startsWith(`${join(agent, name)}/`));
}

export function isSecretPath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  const name = basename(normalized).toLowerCase();
  return (name === ".env" || name.startsWith(".env.")) && name !== ".env.example" ||
    ["auth.json", "credentials", "credentials.json", "application_default_credentials.json", "client_secret.json", ".npmrc", ".netrc", ".pypirc"].includes(name) ||
    /^(?:id_rsa|id_dsa|id_ecdsa|id_ed25519)(?:_sk)?$/.test(name) ||
    /\.(?:key|pem|p12|pfx)$/.test(name) ||
    /(?:^|\/)\.(?:ssh|aws|gnupg)(?:\/|$)/.test(normalized) ||
    /(?:^|\/)\.config\/gcloud(?:\/|$)/.test(normalized);
}

export function classify(call: PolicyCall): Decision {
  if (["read", "edit", "write", "grep", "find", "ls"].includes(call.name)) {
    const path = typeof call.input.path === "string" ? call.input.path :
      typeof call.input.file_path === "string" ? call.input.file_path : ".";
    let resolved: string;
    try { resolved = resolveToolPath(path, call.cwd); }
    catch { return { action: "deny", reason: "Invalid native tool path" }; }
    if (isSecretPath(resolved) || isPrivatePiPath(resolved)) return { action: "deny", reason: "Known secret path is not available to agent tools" };
    if (["grep", "find", "ls"].includes(call.name) && /(?:^|\/)\.pi\/agent\/?$/.test(resolved)) return { action: "deny", reason: "Scope inspection below the credential-bearing agent directory, not at its root" };
    if (call.name === "find" && typeof call.input.pattern === "string" && isSecretPath(call.input.pattern)) {
      return { action: "deny", reason: "Finding a known secret path is not allowed" };
    }
    return { action: "allow", reason: "Ordinary filesystem tool" };
  }
  if (call.name === "bash") return classifyShell(typeof call.input.command === "string" ? call.input.command : "");
  if (call.name.startsWith("mcp__")) {
    const separator = call.name.indexOf("__", 5);
    const tool = separator > 5 ? call.name.slice(separator + 2).toLowerCase() : undefined;
    // Legacy/unstructured names are unknown, never infer permission from a server name.
    if (!tool) return { action: "confirm", reason: "Unknown MCP tool name, fail closed" };
    const words = tool.split(/[^a-z0-9]+/).filter(Boolean);
    if (words.some((word) => ["create", "update", "delete", "remove", "add", "comment", "transition", "register", "relink", "link", "unlink", "close", "reopen", "upload", "share", "send", "edit", "set", "publish", "deploy", "subscribe", "unsubscribe", "manage"].includes(word))) {
      return { action: "confirm", reason: "Potential external MCP mutation" };
    }
    if (call.hints?.destructiveHint || call.hints?.readOnlyHint === false) return { action: "confirm", reason: "MCP annotations suggest side effects (hints only)" };
    if (["search", "get", "list", "read", "docs", "oncall", "who", "debug", "compare"].includes(words[0] ?? "")) {
      return { action: "allow", reason: "Recognized MCP inspection name; annotations are not authorization" };
    }
    return { action: "confirm", reason: "Unknown MCP operation, fail closed" };
  }
  return { action: "allow", reason: "No workflow restriction for this tool" };
}

export function capBashTimeout(input: Record<string, unknown>): void {
  const timeout = input.timeout;
  input.timeout = typeof timeout === "number" && Number.isFinite(timeout) && timeout > 0 ? Math.min(timeout, 300) : 300;
}

function classifyShell(command: string): Decision {
  // Heuristic recognition of common commands, not shell interpretation or a security boundary.
  // Inspect quoted script bodies and substitutions too, without rejecting all compositions.
  const tokens = shellWords(command);
  const scripts = tokens.filter((token) => /[\s;|&`]|\$\(/.test(token));
  const streams = [tokens, ...scripts.map(shellWords), shellWords(command.replace(/["'`]/g, " ").replace(/\$\(/g, " ; "))];
  const flattened = streams.flatMap((stream) => [...stream, ";"]);
  const riskyGit = new Set(["add", "commit", "push", "reset", "clean", "checkout", "restore", "rebase", "merge", "cherry-pick", "revert", "branch", "tag", "remote", "stash", "switch", "worktree", "config", "update-ref", "symbolic-ref", "filter-branch", "gc", "prune"]);
  for (let index = 0; index < flattened.length; index++) {
    const token = basename(flattened[index] ?? "");
    const tail = flattened.slice(index + 1);
    if (["rm", "rmdir", "unlink", "trash", "shred"].includes(token) || (token === "find" && tail.some((item) => item === "-delete"))) return confirm("Filesystem deletion");
    if (token === "git") {
      const command = gitCommand(tail);
      if (command && riskyGit.has(command.verb) && !isGitInspection(command.verb, command.args)) return confirm(`Git ${command.verb} changes repository state`);
    }
    if (["pnpm", "npm", "yarn", "uv", "cargo", "twine", "docker"].includes(token) && tail.some((item) => ["publish", "deploy", "push", "unpublish"].includes(item))) return confirm("Publish/deploy operation");
    if (["kubectl", "helm", "terraform", "pulumi"].includes(token) && tail.some((item) => ["apply", "delete", "destroy", "install", "upgrade", "uninstall", "up", "set", "patch", "replace", "create", "scale", "rollout"].includes(item))) return confirm("Infrastructure mutation");
    if (["aws", "gcloud", "az"].includes(token) && tail.some((item) => /^(?:create|update|delete|put|set|start|stop|terminate|attach|detach|modify|deploy|remove|upload|cp|sync)(?:-|$)/.test(item))) return confirm("Cloud resource mutation");
    if (token === "gh") {
      if (tail.some((item) => ["pr", "issue", "release", "repo"].includes(item)) && tail.some((item) => ["create", "merge", "edit", "close", "reopen", "comment", "delete", "upload", "publish", "fork"].includes(item))) return confirm("GitHub mutation");
      if (tail.includes("api") && (tail.some((item) => /^(?:--method(?:=|$)|-X|--(?:raw-)?field(?:=|$)|-[fF])/.test(item)) || tail.includes("graphql"))) return confirm("GitHub API method/fields may mutate (fields default to POST)");
    }
    if (token === "curl" && tail.some((item) => /^(?:-[a-zA-Z]*[XTdF]|--request(?:=|$)|--upload-file(?:=|$)|--data|--json|--form)/.test(item))) return confirm("HTTP request with explicit method or mutation payload");
    if (token === "wget" && tail.some((item) => /^--(?:method|post-data|post-file|body-data|body-file)(?:=|$)/.test(item))) return confirm("HTTP mutation request");
    if (/^(?:deploy|publish)$/.test(token) || /^(?:deploy|publish)(?:\.[a-z]+)?$/.test(token)) return confirm("Deploy/publish command");
  }
  return { action: "allow", reason: "No recognized side-effect command; ordinary coding/testing remains autonomous" };
}

export function diagnoseViolation(command: string, depth = 0): string | undefined {
  // Command positions come from the lexer; arguments are not executable names.
  if (depth > 3) return "nested shell too deep";
  const parsed = parseShell(command);
  if (!parsed.ok) return `could not parse command (${parsed.error})`;
  for (const script of parsed.substitutions) {
    const violation = diagnoseViolation(script, depth + 1);
    if (violation) return violation;
  }
  for (const simple of parsed.commands) {
    for (const { op, target } of simple.redirects) {
      if ([">", ">>", ">|", "&>", "&>>", ">&"].includes(op) && target !== "/dev/null" &&
        !(op === ">&" && /^(?:\d+|-)$/.test(target))) return `output redirection to ${target}`;
    }
    const violation = diagnoseWords(simple.words, depth);
    if (violation) return violation;
  }
  return undefined;
}

function diagnoseWords(words: string[], depth: number): string | undefined {
  if (depth > 3) return "nested shell too deep";
  while (words.length) {
    const name = basename(words[0]), args = words.slice(1);
    const violation = diagnoseCommand(name, args, depth);
    if (violation) return violation;
    const unwrapped = diagnoseUnwrap(name, args);
    if (!unwrapped) break;
    words = unwrapped;
  }
  return undefined;
}

function diagnoseCommand(name: string, args: string[], depth: number): string | undefined {
  if (name === "sudo") return "sudo changes privilege";
  if (name === "eval") return "eval is not analyzable";
  if (["bash", "sh", "zsh", "dash"].includes(name)) {
    for (let index = 0; index < args.length && args[index].startsWith("-"); index++) {
      if (args[index] === "--") break;
      if (/^-[^-]*c/.test(args[index])) return diagnoseViolation(args[index + 1] ?? "", depth + 1);
      if (["-o", "-O"].includes(args[index])) index++;
    }
  }
  if (["rm", "mv", "cp", "touch", "mkdir", "rmdir", "chmod", "chown", "ln", "truncate", "dd", "tee", "install", "patch", "rsync", "unzip", "mkfifo", "shred"].includes(name)) return `${name} writes files`;
  if (name === "tar" && !(args[0] === "--list" || /^-?[a-zA-Z]*t[a-zA-Z]*$/.test(args[0] ?? ""))) return "tar is not listing";
  if (name === "sed" && args.some((arg) => /^-[a-zA-Z]*i|^--in-place(?:=|$)/.test(arg)) ||
    ["perl", "ruby"].includes(name) && args.some((arg) => /^-[^-]*i/.test(arg))) return `${name} in-place editing`;
  if (name === "find") {
    if (args.some((arg) => ["-delete", "-fprint", "-fprint0", "-fprintf", "-fls", "-ok", "-okdir"].includes(arg))) return "find writes files or executes commands";
    for (let index = 0; index < args.length; index++) {
      if (!["-exec", "-execdir"].includes(args[index])) continue;
      let end = index + 1;
      while (end < args.length && ![";", "+"].includes(args[end])) end++;
      const violation = diagnoseWords(args.slice(index + 1, end).filter((arg) => arg !== "{}"), depth + 1);
      if (violation) return violation;
      index = end;
    }
  }
  if (name === "sort" && args.some((arg) => /^--output(?:=|$)|^-[^-]*o/.test(arg))) return "sort writes output files";
  if (name === "curl") {
    for (let index = 0; index < args.length; index++) {
      const arg = args[index];
      if (/^--(?:remote-name(?:-all)?|output-dir)(?:=|$)|^-[^-]*[OJ]/.test(arg)) return "curl writes downloaded files";
      const output = arg === "--output" ? args[++index] : arg.startsWith("--output=") ? arg.slice(9) :
        /^-[^-]*o/.test(arg) ? arg.slice(arg.indexOf("o") + 1) || args[++index] : undefined;
      if (output !== undefined && !["/dev/null", "-"].includes(output)) return "curl writes output files";
    }
  }
  if (name === "wget" && !args.some((arg, index) => arg === "--spider" || arg === "--output-document=-" ||
    /^-[^-]*O-$/.test(arg) || arg === "-O" && args[index + 1] === "-")) return "wget writes downloaded files";
  if (args.some((arg) => /^--fix(?:$|=|-only$|-type(?:=|$))|^--write(?:$|=)/.test(arg))) return `${name} formatter/fixer flag`;
  if (["prettier", "gofmt", "goimports"].includes(name) && args.includes("-w") || name === "clang-format" && args.includes("-i") ||
    name === "black" && !args.some((arg) => ["--check", "--diff"].includes(arg)) ||
    name === "ruff" && args[0] === "format" && !args.some((arg) => ["--check", "--diff"].includes(arg)) ||
    name === "cargo" && args[0] === "fmt" && !args.includes("--check") ||
    name === "make" && args.some((arg) => ["format", "fmt", "fix", "lint-fix", "lint:fix"].includes(arg) || arg.startsWith("format"))) return `${name} formatting`;
  const rest = diagnoseOptions(args, diagnosePackageOptions());
  const verb = rest[0] ?? "";
  if (["npm", "pnpm", "yarn", "bun"].includes(name)) {
    if (["install", "i", "ci", "add", "uninstall", "remove", "rm", "un", "update", "upgrade", "up", "link", "unlink", "dedupe", "prune"].includes(verb)) return `${name} ${verb} changes packages`;
    const script = verb === "run" ? diagnoseOptions(rest.slice(1))[0] ?? "" : verb;
    if (["format", "fmt", "fix", "lint:fix"].includes(script) || script.startsWith("format:")) return `${name} ${script} formatting`;
  }
  if (name === "uv" && ["add", "remove", "sync", "lock", "pip", "tool", "venv"].includes(verb) ||
    ["pip", "pip3"].includes(name) && ["install", "uninstall", "download"].includes(verb) ||
    name === "pipx" && verb !== "list" || name === "cargo" && ["install", "add", "remove", "update"].includes(verb) ||
    name === "go" && (["install", "get"].includes(verb) || verb === "mod" && rest[1] === "tidy") ||
    name === "brew" && ["install", "upgrade", "uninstall", "reinstall", "link", "unlink", "tap"].includes(verb) ||
    name === "gem" && ["install", "uninstall"].includes(verb)) return `${name} ${verb} changes packages`;
  if (["npx", "pnpx", "bunx"].includes(name)) {
    const target = diagnoseOptions(args, ["--package", "-p", "--cache", "--userconfig", "--registry"]);
    if (basename(target[0] ?? "") === "playwright" && target[1] === "install") return "playwright install changes packages";
  }
  if (name === "git") return gitInspectionViolation(args);
  return undefined;
}

function diagnoseUnwrap(name: string, args: string[]): string[] | undefined {
  if (name === "env") {
    const rest = diagnoseOptions(args, ["-u", "--unset", "-C", "--chdir", "-S", "--split-string"]);
    const index = rest.findIndex((arg) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(arg));
    return index < 0 ? [] : rest.slice(index);
  }
  if (["time", "nohup", "command", "nice", "timeout", "xargs"].includes(name)) {
    const values = name === "time" ? ["-f", "--format", "-o", "--output"] : name === "nice" ? ["-n", "--adjustment"] :
      name === "timeout" ? ["-s", "--signal", "-k", "--kill-after"] : name === "xargs" ?
      ["-a", "--arg-file", "-d", "--delimiter", "-E", "-I", "-L", "--max-lines", "-n", "--max-args", "-P", "--max-procs", "-s", "--max-chars", "--replace", "--eof"] : [];
    const rest = diagnoseOptions(args, values);
    return name === "timeout" ? rest.slice(1) : rest;
  }
  const rest = diagnoseOptions(args, diagnosePackageOptions());
  if (name === "mise" && ["exec", "x"].includes(rest[0] ?? "")) {
    const separator = rest.indexOf("--");
    return separator < 0 ? undefined : rest.slice(separator + 1);
  }
  if (name === "uv" && rest[0] === "run") return diagnoseOptions(rest.slice(1), ["--with", "--with-editable", "--with-requirements", "--python", "-p", "--project", "--directory", "--package", "--env-file", "--index", "--index-url", "--extra-index-url", "--config-file"]);
  if (name === "npm" && rest[0] === "exec" || ["pnpm", "yarn"].includes(name) && ["exec", "dlx"].includes(rest[0] ?? "") ||
    name === "bun" && rest[0] === "x") return diagnoseOptions(rest.slice(1), ["--package", "-p", ...diagnosePackageOptions()]);
  if (["npx", "pnpx", "bunx"].includes(name)) return diagnoseOptions(args, ["--package", "-p", "--cache", "--userconfig", "--registry"]);
  return undefined;
}

function diagnosePackageOptions(): string[] {
  return ["--filter", "-F", "--workspace", "-w", "--dir", "-C", "--prefix", "--cwd", "--directory", "--project", "--loglevel", "--userconfig", "--registry", "--tag", "--omit", "--include", "--cache"];
}

function diagnoseOptions(args: string[], values: string[] = []): string[] {
  let index = 0;
  while (index < args.length && args[index].startsWith("-")) {
    const option = args[index++];
    if (option === "--") break;
    if (values.includes(option)) index++;
  }
  return args.slice(index);
}

export function gitInspectionViolation(args: string[]): string | undefined {
  let index = 0;
  while (index < args.length && args[index].startsWith("-")) {
    const option = args[index++];
    if (option === "-C" && args[index] && !args[index].startsWith("-")) index++;
    else if (option !== "--no-pager") return `git global option ${option} is not read-only inspection`;
  }
  const verb = args[index], tail = args.slice(index + 1);
  const inspection = ["status", "diff", "log", "show", "blame", "rev-parse", "ls-files", "ls-tree", "describe", "shortlog", "merge-base", "name-rev", "diff-tree", "cat-file", "grep", "rev-list", "for-each-ref", "show-ref", "ls-remote", "check-ignore", "check-attr", "version"].includes(verb) ||
    verb === "reflog" && (!tail.length || tail[0] === "show") ||
    verb === "branch" && gitListingOptions(tail, false) || verb === "tag" && gitListingOptions(tail, true) ||
    verb === "stash" && ["list", "show"].includes(tail[0]) ||
    verb === "remote" && (!tail.length || tail.length === 1 && tail[0] === "-v" ||
      tail[0] === "get-url" && tail.length > 1 && tail.slice(1).every((arg) => !arg.startsWith("-") || ["--all", "--push"].includes(arg)) ||
      tail[0] === "show" && tail.length === 2 && !tail[1].startsWith("-")) ||
    verb === "config" && gitConfigInspection(tail);
  if (!inspection) return `git ${verb ?? "command"} is not read-only inspection`;
  const unsafe = tail.find((arg) => /^-O|^--open-files-in-pager|^--(?:output|exec)(?:=|$)/.test(arg) || ["--ext-diff", "--textconv"].includes(arg));
  return unsafe ? `git ${unsafe} can write or execute commands` : undefined;
}

function gitListingOptions(args: string[], tag: boolean): boolean {
  let patterns = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--list" || tag && arg === "-l") { patterns = true; continue; }
    if (!arg.startsWith("-")) { if (!patterns) return false; continue; }
    if (/^--(?:sort|format|contains)=/.test(arg) || !tag && /^--(?:merged|no-merged)=/.test(arg)) continue;
    if (tag && ["--sort", "--format"].includes(arg)) {
      if (!args[index + 1] || args[++index].startsWith("-")) return false;
      continue;
    }
    if ((tag ? ["--contains"] : ["--contains", "--merged", "--no-merged"]).includes(arg)) {
      if (args[index + 1] && !args[index + 1].startsWith("-")) index++;
      continue;
    }
    if (!tag && ["-a", "-r", "-v", "-vv", "--show-current"].includes(arg)) continue;
    return false;
  }
  return !tag || !args.length || patterns;
}

function gitConfigInspection(args: string[]): boolean {
  let index = 0;
  while (["--local", "--global", "--system", "--worktree", "--includes", "--show-origin"].includes(args[index])) index++;
  const verb = args[index], tail = args.slice(index + 1);
  if (["--list", "-l"].includes(verb)) return !tail.length;
  return ["--get", "--get-all", "--get-regexp"].includes(verb) && tail.length >= 1 && tail.length <= 2 && tail.every((arg) => !arg.startsWith("-"));
}

function confirm(reason: string): Decision { return { action: "confirm", reason }; }

function gitCommand(tokens: string[]): { verb: string; args: string[] } | undefined {
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (!token || /^[;&|()]$/.test(token)) return undefined;
    if (["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--config-env"].includes(token)) { index++; continue; }
    if (token.startsWith("-")) continue;
    const end = tokens.findIndex((item, offset) => offset > index && /^[;&|()]$/.test(item));
    return { verb: token, args: tokens.slice(index + 1, end < 0 ? undefined : end) };
  }
  return undefined;
}

function isGitInspection(verb: string, args: string[]): boolean {
  if (verb === "branch") return args.length === 1 && args[0] === "--show-current" ||
    args[0] === "--list" && args.slice(1).every((arg) => !arg.startsWith("-"));
  if (verb === "tag") return args[0] === "--list" && args.slice(1).every((arg) => !arg.startsWith("-"));
  if (verb === "remote") return args.length === 0 || args.length === 1 && ["-v", "--verbose", "list"].includes(args[0] ?? "") ||
    args[0] === "get-url" && args.slice(1).every((arg) => !arg.startsWith("-") || ["--all", "--push"].includes(arg));
  if (verb === "config") {
    const remaining = args.filter((arg) => !["--local", "--global", "--system", "--worktree", "--includes", "--no-includes"].includes(arg));
    return ["--get", "--get-all", "--get-regexp"].includes(remaining[0] ?? "") && remaining.length >= 2 && remaining.length <= 3 && remaining.slice(1).every((arg) => !arg.startsWith("-"));
  }
  return false;
}

function shellWords(command: string): string[] {
  return Array.from(command.matchAll(/"((?:\\.|[^"\\])*)"|'([^']*)'|([^\s"';|&()]+)|([;|&()])/g), (match) => match[1] ?? match[2] ?? match[3] ?? match[4] ?? "");
}
