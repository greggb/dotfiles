import assert from "node:assert/strict";
import { test } from "node:test";
import { approvalReason } from "../guard.ts";

test("irreversible or external commands need approval", () => {
  for (const command of [
    "git push origin feat/x",
    "cd repo && git -C ../other push --force-with-lease",
    "git reset --hard origin/main",
    "git clean -fd",
    "gh pr merge 241 --squash",
    "gh release create v1.2.0",
    "kubectl apply -f deploy.yaml",
    "helm upgrade camarilla ./chart",
    "pnpm publish",
    "docker push ecr/camarilla:latest",
    "make staging-deploy",
  ]) assert.ok(approvalReason("bash", { command }), command);
});

test("routine local work runs without approval", () => {
  for (const command of [
    "git add src/a.py && git commit -m 'Fix'",
    "git checkout -b feat/x",
    "git switch main && git merge --ff-only origin/main",
    "git rebase origin/main",
    "git worktree remove ../camarilla-old",
    "git branch -a | head",
    "rm -rf /tmp/camarilla-probe",
    "gh pr view 241 --json comments",
    "gh pr create --draft --title 'Fix'",
    "gh api repos/o/r/pulls/1/comments",
    "uv run pytest tests/test_x.py",
    "python3 - <<'EOF'\nprint('publish the digest')\nEOF",
    "kubectl get pods",
  ]) assert.equal(approvalReason("bash", { command }), undefined, command);
});

test("MCP writes need approval and reads do not", () => {
  assert.ok(approvalReason("mcp__devprod_mcp_gateway__jira_transition_issue", {}));
  assert.ok(approvalReason("mcp__glean__share_artifact", {}));
  assert.equal(approvalReason("mcp__devprod_mcp_gateway__jira_search_issues", {}), undefined);
  assert.equal(approvalReason("mcp__glean__chat", {}), undefined);
  assert.equal(approvalReason("read", { path: "src/a.py" }), undefined);
});
