import assert from "node:assert/strict";
import { test } from "node:test";
import { classify, capBashTimeout, diagnoseViolation, gitInspectionViolation, isSecretPath } from "../policy.ts";
import { gitArgs, inspectGit, type GitInspection } from "../git-inspect.ts";
import type { ProcessOptions, ProcessResult } from "../process.ts";
import { getRole } from "../roles.ts";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const cwd = "/project";
const bash = (command: string) => classify({ name: "bash", input: { command }, cwd });

test("normal coding and composed test commands stay autonomous", () => {
  for (const command of ["mise exec node@24 -- pnpm test && pnpm run build", "uv run pytest tests/test_api.py", "git -C /repo status --short; git diff", "pnpm lint | tee result.txt", "result=$(git log -1 --oneline); printf '%s' \"$result\"", "curl -sS https://example.test", "gh api repos/owner/repo", "gh pr view 12", "pnpm run typecheck"]) {
    assert.equal(bash(command).action, "allow", command);
  }
});

test("compositions, substitutions, git options and common external mutations require confirmation", () => {
  for (const command of [
    "git commit -m hi", "git -C /repo commit -m hi", "git --git-dir=/repo/.git -c user.name=x push", "git -C /repo -c user.name=x reset --hard",
    "pnpm test && git push", "echo $(git -C /repo commit -m hi)", "echo `git push`", "bash -c 'git -C /repo push'", "rm -rf dist", "find . -name '*.tmp' -delete",
    "pnpm publish", "uv publish", "pnpm run deploy", "./deploy.sh", "helm upgrade app chart", "kubectl apply -f app.yaml", "aws s3 cp file s3://bucket/key", "gcloud projects delete project",
    "curl -XPOST https://example.test", "curl --data '{}' https://example.test", "curl --json '{}' https://example.test", "curl -sSXPOST https://example.test", "curl --upload-file file https://example.test", "wget --post-data=x https://example.test",
    "gh pr create", "gh -R owner/repo pr merge 12", "gh issue edit 12", "gh api repos/o/r/issues -f title=x", "gh api --method PATCH repos/o/r", "gh api graphql -F query=x",
  ]) assert.equal(bash(command).action, "confirm", command);
});

test("diagnose allows targeted checks, logs, GET and read-only Git inspection", () => {
  for (const command of [
    "uv run pytest tests/test_x.py -x", "mise exec -- pnpm --dir web run test src/a.test.ts",
    "git diff --stat", "git -C /repo status --short", "git log -1", "git show HEAD:src/a.ts",
    "git branch --show-current", "git config --get user.name", "git remote -v",
    "tail -n 200 app.log | grep ERROR", "make check", "curl -s localhost:8000/health",
    "make check 2>&1", "make check >/dev/null", "make check 2>/dev/null", "make check > /dev/null 2>&1",
    "make check && git diff --stat; uv run pytest\ngit status", "bash -c 'make check'",
    'echo $(git diff --stat)', 'echo `git status`',
    "uv run pytest -k black", "make test-fast", "git -C /repo log --grep touch -5",
    "tail -n 200 app.log | grep 'touch'", "grep 'a > b' app.log", 'grep -n "rm -rf" docs', "ls black",
    "cmd 2>&1 | tail -50", "cmd >&2", "cmd > /dev/null 2>&1", "cmd <&0", "cmd 3>&-",
    "sed -n 1,20p file", "perl -ne 'print if /x/' f", "ruby -ne 'puts $_' f",
    "pnpm test", "npm run test", "ruff check .", "ruff format --check .", "ruff format --diff .",
    "black --check .", "black --diff .", "prettier --check .", "cargo fmt --check", "tar -tf x.tar", "tar --list -f x.tar",
    "cat <<'EOF'\nrm -rf /\nEOF", "env FOO=1 pytest", "timeout 60 uv run pytest",
    "env -u HOME FOO=1 command nohup nice -n 5 pytest", "time -p pytest", "timeout -s TERM 60 pytest",
    "uv run --with x pytest", "uv run --with=x pytest", "uv run --python 3.12 pytest",
    "mise x node@24 -- pnpm exec vitest run", "pnpm --dir web exec vitest run", "pnpm dlx eslint --check .",
    "npx --yes --package eslint eslint .", "pnpx prettier --check .", "bunx prettier --check .",
    "xargs -I {} grep touch {} < list", "git --no-pager diff --no-ext-diff --no-textconv", "pipx list",
    "grep --fixed-strings ERROR app.log", "rg --fixed-strings x", "eslint --fix-dry-run .",
    "diff <(sort expected.txt) <(sort actual.txt)", "find . -name '*.ts'",
    "find . -name '*.py' -exec grep -l TODO {} +", "find . -execdir grep TODO {} \\;", "sort app.log | uniq -c",
    "curl -s -o /dev/null -w '%{http_code}' localhost:8000", "curl --output=- localhost:8000",
    "wget -qO- localhost:8000/health", "wget -O - https://h/f", "wget -O- https://h/f", "wget --output-document=- https://h/f", "wget --spider https://h/f",
    "npm exec -- vitest run", "npm exec --package vitest -- vitest run", "yarn exec vitest run", "yarn dlx vitest run", "bun x vitest run",
    "if git diff --quiet; then echo clean; fi", "git branch", "git branch -a", "git tag", "git tag -l 'v*'",
    "git stash list", "git config --list", "git ls-remote origin", "git show-ref", "git diff --output-indicator-new=+",
  ]) {
    assert.equal(diagnoseViolation(command), undefined, command);
  }
});

test("diagnose recognizes writes, package changes, formatters and non-inspection Git", () => {
  for (const command of [
    "echo x > a.txt", "echo x >>a.txt", "make check 2> errors.log", "cat a | tee b",
    "sed -i s/a/b/ f", "sed --in-place=.bak s/a/b/ f", "perl -pi -e s/a/b/ f",
    ...["rm", "mv", "cp", "touch", "mkdir", "rmdir", "chmod", "chown", "ln", "truncate", "dd"].map((verb) => `${verb} file`),
    ...["npm", "pnpm", "yarn", "bun"].flatMap((tool) => ["install", "i", "add", "remove", "update", "upgrade"].map((verb) => `${tool} ${verb} zod`)),
    "pnpm --dir web add zod", "uv add zod", "uv remove zod", "uv sync", "uv pip list", "uv lock", "pip install zod", "pip3 install zod",
    "brew install node", "brew upgrade", "brew uninstall node", "make format", "ruff format .", "black .", "prettier --write .", "eslint --fix .", "gofmt -w main.go",
    "git checkout -- .", "git init", "git fetch", "git config user.name x", "git branch new", "git diff --output=patch.txt",
    'bash -c "rm x"', "sh -c 'touch x'", 'echo $(touch x)', 'echo `touch x`',
    "make check && touch x", "make check || touch x", "make check; touch x", "make check\ntouch x", "cat a | touch x",
    'bash -c "echo x > a.txt"', "make check 2>&1 >a.txt", "make check >/dev/null; echo x >>a.txt",
    "npm ci", "pnpm uninstall zod", "pip uninstall -y zod", "pnpm --filter web add zod",
    "install -m 644 a b", "perl -0pi -e 's/a/b/' f", "ruby -i.bak -pe 'gsub(/a/, b)' f",
    "prettier -w src/a.ts", "ruff check --fix-only .", "patch -p1 < fix.patch", "rsync -a a b",
    "tar -xf a.tar", "unzip a.zip", "cargo fmt", "pnpm format", "git -c diff.external=x diff",
    "git diff --ext-diff", "git show --textconv HEAD", "git grep -O touch x", "git grep --open-files-in-pager=touch x",
    'bash -c "r""m x"', "sh -lc 'pnpm add x'", "mise exec -- pnpm add zod", "echo $(rm x)",
    "FOO=1 rm x", "xargs rm < list", "timeout 5 rm x", 'eval "rm x"', "sudo ls", 'echo "abc', "cmd >&out.txt",
    "echo x >| out", "echo x &> out", "echo x &>> out", "env FOO=1 /bin/rm x", "command rm x",
    "nohup rm x", "nice -n 5 rm x", "time -p rm x", "xargs -I {} rm {} < list", "timeout -k 1 5 rm x",
    "uv run --with x rm x", "mise x node@24 -- pnpm add x", "pnpm exec rm x", "pnpm --dir web exec rm x",
    "pnpm dlx prettier --write .", "npx --yes playwright install", "pnpx playwright install", "bunx playwright install",
    "npx --package prettier prettier -w .", "goimports -w f.go", "clang-format -i f.cc", "make fmt", "make format-check",
    "npm run format", "pnpm format:all", "yarn lint:fix", "pnpm --workspace web add x", "pnpm --filter=web add x",
    "uv tool list", "uv venv", "pip download x", "pipx install x", "cargo add x", "go get x", "go mod tidy", "brew tap x", "gem uninstall x",
    "git --config-env=x diff", "git --exec-path=/tmp diff", "git --git-dir=/tmp diff", "git --work-tree /tmp diff",
    "git --namespace=x diff", "git -p diff", "git --paginate diff", "git diff --output patch", "git grep -Oless x",
    "bash -ec 'touch x'", "zsh -xc 'touch x'", "dash -c 'touch x'", "echo $(echo $(touch x))",
    ...["mkfifo", "shred"].map((verb) => `${verb} file`),
    "if true; then rm tracked.txt; fi", 'for f in a; do rm "$f"; done', "while read l; do pnpm add zod; done < pkgs",
    "find . -name '*.tmp' -delete", "find . -exec rm {} +", "find . -exec sed -i s/a/b/ {} +", "find . -fprint out.txt",
    "find . -execdir rm {} \\;", "find . -exec grep x {} + -exec rm {} +", "sort -o out.txt in.txt", "sort --output=out.txt in.txt",
    "curl -o out.json localhost:8000", "curl -O https://h/f", "curl --output=out.json https://h/f", "curl -soout https://h/f",
    "wget https://h/f", "npm exec -- prettier -w src/a.ts", "npm exec --package prettier -- prettier -w src/a.ts",
    "yarn exec rm x", "yarn dlx prettier -w x", "bun x prettier -w x", "bunx rm x",
    "npm --loglevel warn install", "npm --userconfig .npmrc install", "diff <(rm x) b",
    "git branch new-branch", "git branch -D x", "git tag v1", "git stash", "git stash pop", "git remote add o url", "git reflog expire --all",
    ...["-fprint0", "-fprintf", "-fls", "-ok", "-okdir"].map((flag) => `find . ${flag} out`),
    ...["--remote-name", "--remote-name-all", "--output-dir=out", "-J"].map((flag) => `curl ${flag} https://h/f`),
    ...["--registry", "--tag", "--omit", "--include", "--cache", "--workspace", "-w"].map((flag) => `npm ${flag} value install`),
    ...["--fix", "--fix=true", "--fix-only", "--fix-type", "--fix-type=problem", "--write", "--write=true"].map((flag) => `tool ${flag} .`),
  ]) assert.equal(typeof diagnoseViolation(command), "string", command);
});

test("shared Git inspection permits only listing forms and safe output flags", () => {
  for (const args of [
    ["branch", "-a", "-r", "-v", "-vv", "--sort=-committerdate", "--format=%(refname)"],
    ["branch", "--contains", "HEAD", "--merged", "--no-merged"], ["branch", "--list", "feature/*"],
    ["branch", "--contains=HEAD", "--merged=HEAD", "--no-merged=main"], ["tag", "-l", "--contains=HEAD"],
    ["tag", "--list", "v*", "--sort=version:refname", "--format=%(refname)", "--contains", "HEAD"],
    ["tag", "-l", "--sort", "refname", "--format", "%(refname)"], ["stash", "show", "-p"],
    ["remote", "get-url", "--all", "origin"], ["remote", "show", "origin"], ["reflog"], ["reflog", "show", "HEAD"],
    ["config", "--local", "--global", "--system", "--worktree", "--includes", "--show-origin", "--list"],
    ["config", "--get-all", "user.name"], ["config", "--get-regexp", "^remote"], ["config", "-l"],
    ...["rev-list", "for-each-ref", "show-ref", "ls-remote", "check-ignore", "check-attr", "version", "name-rev", "diff-tree"].map((verb) => [verb]),
    ["diff", "--output-indicator-old=-", "--output-indicator-context= ", "--no-ext-diff", "--no-textconv"],
  ]) assert.equal(gitInspectionViolation(args), undefined, args.join(" "));
  for (const args of [
    ["branch", "--list", "--delete", "main"], ["branch", "--contains", "HEAD", "new"], ["tag", "--contains", "HEAD"],
    ["tag", "-l", "--delete", "v1"], ["remote", "show", "origin", "other"], ["config", "--list", "--unset", "x"],
    ["config", "--get", "x", "--unset"], ["reflog", "delete", "HEAD"], ["-C"], ["-C", "--no-pager", "status"],
    ...["-Oless", "--open-files-in-pager=less", "--ext-diff", "--textconv", "--output", "--output=out"].map((flag) => ["diff", flag]),
  ]) assert.equal(typeof gitInspectionViolation(args), "string", args.join(" "));
});

test("diagnose returns precise parse, redirect and recursion reasons", () => {
  assert.equal(diagnoseViolation("echo x > a.txt"), "output redirection to a.txt");
  assert.equal(diagnoseViolation("cmd >&out.txt"), "output redirection to out.txt");
  assert.equal(diagnoseViolation('echo "abc'), "could not parse command (Unterminated double quote)");
  assert.equal(diagnoseViolation('eval "rm x"'), "eval is not analyzable");
  assert.equal(diagnoseViolation("true", 4), "nested shell too deep");
  let script = "true";
  for (let depth = 0; depth < 3; depth++) script = `echo $(${script})`;
  assert.equal(diagnoseViolation(script), undefined);
  assert.equal(diagnoseViolation(`echo $(${script})`), "nested shell too deep");
});

test("loaded child policy enforces diagnose rules only for diagnose", async () => {
  const installed = join(process.env.PI_RUNTIME_DIR ?? join(homedir(), ".local/share/pi-runtime"), "node_modules/@earendil-works/pi-coding-agent/dist/");
  const { loadExtensions } = await import(installed + "core/extensions/loader.js");
  const old = process.env.PI_WORKFLOW_ROLE;
  try {
    for (const role of ["diagnose", "implementer"]) {
      process.env.PI_WORKFLOW_ROLE = role;
      const loaded = await loadExtensions([fileURLToPath(new URL("../child-policy.ts", import.meta.url))], cwd);
      assert.deepEqual(loaded.errors, []);
      const [guard] = loaded.extensions[0].handlers.get("tool_call");
      const result = await guard({ toolName: "bash", input: { command: "pnpm add zod" } }, { cwd });
      if (role === "diagnose") assert.deepEqual(result, {
        block: true, reason: "Diagnose role is read-only: pnpm add changes packages. Report the needed change to the parent instead.",
      });
      else assert.equal(result, undefined);
      assert.equal(await guard({ toolName: "bash", input: { command: "git diff --stat" } }, { cwd }), undefined);
    }
  } finally {
    if (old === undefined) delete process.env.PI_WORKFLOW_ROLE;
    else process.env.PI_WORKFLOW_ROLE = old;
  }
});

test("MCP names fail closed for unknown operations and hints never authorize writes", () => {
  for (const name of ["mcp__jira__create_issue", "mcp__jira__add_comment", "mcp__jira__transition_issue", "mcp__bb__relink_bfgs", "mcp__bb__close_bfgs", "mcp__bb__reopen_bfgs", "mcp__server__register_credential", "mcp__mystery", "mcp__server__manage_tools", "mcp__get__unknown", "mcp__list_search__unknown", "mcp__get__test_backend", "mcp__jira__get_and_delete_issue"]) {
    assert.equal(classify({ name, input: {}, cwd, hints: { readOnlyHint: true } }).action, "confirm", name);
  }
  for (const name of ["mcp__jira__search_issues", "mcp__docs__get_page", "mcp__server__list_images", "mcp__server__who_is_on_call", "mcp__jira__get_attachment", "mcp__jira__list_attachments", "mcp__evg__get_test_results", "mcp__server__list_credentials", "mcp__server__get_credential", "mcp__delete_server__get_page"]) assert.equal(classify({ name, input: {}, cwd }).action, "allow", name);
  assert.equal(classify({ name: "mcp__server__get_data", input: {}, cwd, hints: { destructiveHint: true } }).action, "confirm");
});

test("Pi-equivalent lexical path aliases cannot bypass secret or private Pi location denials", () => {
  const agent = join(homedir(), ".pi", "agent");
  const privatePaths = ["auth.json", "models.json", "mcp.json", "models-store.json", "sessions", "sessions/session.jsonl"];
  for (const file of privatePaths) {
    for (const path of [`@${file}`, `~/.pi/agent/${file}`, `@~/.pi/agent/${file}`, pathToFileURL(join(agent, file)).href, `@${pathToFileURL(join(agent, file)).href}`]) {
      for (const name of ["read", "edit", "write", "grep", "find", "ls"]) assert.equal(classify({ name, input: { path }, cwd: agent }).action, "deny", `${name} ${path}`);
    }
  }
  for (const path of ["@.env", "@auth.json", "file:///project/%2Eenv", "@file:///project/auth.json", "~/.pi/backups", "@~/.pi/backups/backup.json", pathToFileURL(join(homedir(), ".pi", "backups", "backup.json")).href]) {
    assert.equal(classify({ name: "read", input: { path }, cwd }).action, "deny", path);
  }
  for (const path of ["@~/.pi/agent", "~/.pi/agent", "@.", pathToFileURL(agent).href]) {
    for (const name of ["grep", "find", "ls"]) assert.equal(classify({ name, input: { path }, cwd: agent }).action, "deny", path);
  }
  for (const path of ["models.json", "mcp.json", "models-store.json", "sessions/test.txt", "@.env.example"]) assert.equal(classify({ name: "read", input: { path }, cwd }).action, "allow", path);
  assert.equal(classify({ name: "read", input: { path: "file://bad-host/secret" }, cwd }).action, "deny");
});

test("narrow Git inspections do not pause, mutations still do", () => {
  for (const command of ["git branch --show-current", "git -C /repo branch --list", "git branch --list 'feature/*'", "git tag --list", "git config --get user.name", "git config --global --get-all safe.directory", "git config --get-regexp '^remote'", "git remote -v", "git remote get-url origin", "git remote get-url --all origin", "git remote", "git remote list", "git branch --show-current && pnpm test"]) assert.equal(bash(command).action, "allow", command);
  for (const command of ["git branch new", "git branch --list --delete main", "git tag new", "git config user.name x", "git config --get user.name --unset-all", "git remote add origin url", "git remote set-url origin url", "git branch --show-current; git push", "git config --get user.name && git commit -m x"]) assert.equal(bash(command).action, "confirm", command);
});

test("native filesystem secret checks are exact, not a blanket project read ban", () => {
  for (const path of [".env", ".env.local", "auth.json", "/home/u/.ssh/id_ed25519", "/home/u/.aws", "cert.pem", "private.key", ".config/gcloud"]) {
    assert.equal(isSecretPath(path), true, path);
    for (const name of ["read", "edit", "write", "grep", "find", "ls"]) assert.equal(classify({ name, input: { path }, cwd }).action, "deny", `${name} ${path}`);
  }
  for (const path of [".env.example", "src/auth.ts", "src/environment.ts", "README.md", "src"]) assert.equal(classify({ name: "read", input: { path }, cwd }).action, "allow", path);
  assert.equal(classify({ name: "read", input: { file_path: ".env" }, cwd }).action, "deny");
  assert.equal(classify({ name: "find", input: { path: ".", pattern: "**/auth.json" }, cwd }).action, "deny");
  assert.equal(classify({ name: "ls", input: { path: "/home/u/.pi/agent" }, cwd }).action, "deny");
  assert.equal(classify({ name: "grep", input: { path: "workflow" }, cwd: "/home/u/.pi/agent" }).action, "allow");
});

test("Bash timeout is explicit, seconds, finite and capped", () => {
  for (const timeout of [undefined, 0, -1, NaN, Infinity, 600]) {
    const input: Record<string, unknown> = { timeout }; capBashTimeout(input); assert.equal(input.timeout, 300);
  }
  const input = { timeout: 15 }; capBashTimeout(input); assert.equal(input.timeout, 15);
});

test("patches require exact non-secret paths and disable renames", () => {
  const operations: GitInspection["operation"][] = ["diff", "show"];
  for (const path of [undefined, ".", "src/", "../safe", "src/*", ":(glob)**", "/root/file", ".env", "sub/auth.json", "key.pem"]) {
    for (const operation of operations) assert.throws(() => gitArgs({ operation, path }));
  }
  assert.ok(gitArgs({ operation: "diff", path: "src/main.ts" }).includes("--no-renames"));
});

test("patch filename discovery runs before content and refuses directory expansion/secrets/truncation", async () => {
  const operations: GitInspection["operation"][] = ["diff", "show"];
  for (const operation of operations) {
    for (const names of ["src/main.ts\0", "src/main.ts\0.env\0", "src/main.ts/nested.ts\0", "[truncated]", ""]) {
      const calls: ProcessOptions[] = [];
      const fake = async (options: ProcessOptions): Promise<ProcessResult> => {
        calls.push(options);
        return { exitCode: 0, signal: null, stdout: calls.length === 1 ? "/project\n" : calls.length === 2 ? names : "safe patch", stderr: "" };
      };
      const result = await inspectGit({ operation, path: "src/main.ts" }, cwd, undefined, fake);
      assert.ok(calls[1]?.args.includes("--name-only"));
      if (names === "src/main.ts\0") { assert.equal(calls.length, 3); assert.equal(result.stdout, "safe patch"); }
      else { assert.equal(calls.length, 2); if (names) assert.equal(result.isError, true); }
    }
  }
});

test("adversarial roles require evidence and allow no fabricated findings", () => {
  assert.equal(getRole("reviewer-deepseek").model, "FW-DeepSeek-V4.1-Flash");
  for (const name of ["reviewer-deepseek", "reviewer-opus"]) {
    const prompt = getRole(name).prompt;
    for (const term of ["evidence", "confidence", "regression", "accept, reject, revise", "unresolved", "Never fabricate"]) assert.ok(prompt.includes(term), term);
  }
});

test("patches deny private Pi locations after resolving repo root, before discovery or content", async () => {
  const operations: GitInspection["operation"][] = ["diff", "show"];
  const agent = join(homedir(), ".pi", "agent");
  const cases = [
    ...["models.json", "mcp.json", "models-store.json", "sessions/session.jsonl"].map((path) => ({ root: agent, path, denied: true })),
    { root: homedir(), path: ".pi/backups/backup.json", denied: true },
    { root: join(homedir(), ".pi", "backups"), path: "backup.json", denied: true },
    { root: "/project", path: "models.json", denied: false },
  ];
  for (const operation of operations) {
    for (const fixture of cases) {
      const calls: ProcessOptions[] = [];
      const fake = async (options: ProcessOptions): Promise<ProcessResult> => {
        calls.push(options);
        return { exitCode: 0, signal: null, stderr: "", stdout: calls.length === 1 ? `${fixture.root}\n` : calls.length === 2 ? `${fixture.path}\0` : "safe patch" };
      };
      const result = await inspectGit({ operation, path: fixture.path }, "/unrelated-parent-cwd", undefined, fake);
      assert.equal(result.isError, fixture.denied, `${operation} ${fixture.root}/${fixture.path}`);
      assert.equal(calls.length, fixture.denied ? 1 : 3);
      if (fixture.denied) {
        assert.equal(result.stdout, "");
        assert.match(result.error ?? "", /Private Pi locations/);
      } else assert.equal(result.stdout, "safe patch");
    }
  }
});
