import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { inspectGit } from "./git-inspect.ts";
import { getRole, toolsFor } from "./roles.ts";
import { capBashTimeout, classify, diagnoseViolation } from "./policy.ts";

export default function childPolicy(pi: ExtensionAPI) {
  const role = getRole(process.env.PI_WORKFLOW_ROLE ?? "");
  const allowed = toolsFor(role);
  pi.registerTool({
    name: "git_inspect", label: "Inspect Git", description: "Read-only Git status, diff, log or show. Diff/show require an exact non-secret file path, discovered first with status/log or find. No globs, arbitrary flags, shell, textconv, hooks or external diff.",
    parameters: Type.Object({
      operation: Type.Union([Type.Literal("status"), Type.Literal("diff"), Type.Literal("log"), Type.Literal("show")]),
      revision: Type.Optional(Type.String()), path: Type.Optional(Type.String()), staged: Type.Optional(Type.Boolean()),
    }),
    annotations: { readOnlyHint: true },
    async execute(_id, params, signal, _update, ctx) {
      const result = await inspectGit(params, ctx.cwd, signal);
      return { content: [{ type: "text", text: result.error ?? ((result.stdout + result.stderr) || "(empty)") }], details: result, isError: result.isError };
    },
  });
  pi.on("session_start", (_event, ctx) => {
    // Fail before the first request, rather than accepting Pi's fuzzy model resolution.
    if (ctx.model?.provider !== role.provider || ctx.model.id !== role.model) {
      process.stderr.write(`Workflow requires exact model ${role.provider}/${role.model}; refusing fallback\n`);
      process.exit(1);
    }
    pi.setActiveTools(allowed);
  });
  pi.on("tool_call", (event, ctx) => {
    if (!allowed.includes(event.toolName)) return { block: true, reason: "Tool not allowed in this workflow role" };
    if (event.toolName === "bash") {
      capBashTimeout(event.input);
      if (role.access === "diagnose") {
        const violation = diagnoseViolation(typeof event.input.command === "string" ? event.input.command : "");
        if (violation) return { block: true, reason: `Diagnose role is read-only: ${violation}. Report the needed change to the parent instead.` };
      }
    }
    const decision = classify({ name: event.toolName, input: event.input, cwd: ctx.cwd });
    if (decision.action !== "allow") return { block: true, reason: `${decision.reason}. Child cannot authorize this operation. Return this blocker to the parent; do not retry via another tool.` };
    return undefined;
  });
}
