import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { modelProfiles, type ModelProfile } from "./model-profiles.ts";

function profileLabel(profile: ModelProfile): string {
  return `${profile.name}: ${profile.provider}/${profile.model} · ${profile.thinkingLevel} effort · ${profile.description}`;
}

export default function mode(pi: ExtensionAPI) {
  let failedSelection: string | undefined;

  function fail(ctx: ExtensionContext, message: string): void {
    if (!ctx.hasUI) {
      failedSelection = message;
      throw new Error(message);
    }
    ctx.ui.notify(message, "error");
  }

  pi.on("input", (_event, ctx) => {
    if (failedSelection && !ctx.hasUI) {
      console.error(`Input skipped after model selection failure: ${failedSelection}. Select a valid /mode before continuing.`);
      return { action: "handled" };
    }
  });

  pi.registerCommand("mode", {
    description: "Select model + effort: fast, build, deep, second",
    getArgumentCompletions(prefix) {
      return modelProfiles.filter((profile) => profile.name.startsWith(prefix)).map((profile) => ({ value: profile.name, label: profileLabel(profile) }));
    },
    handler: async (args, ctx) => {
      let name = args.trim();
      if (!name) {
        if (!ctx.hasUI) {
          fail(ctx, "Usage: /mode fast|build|deep|second");
          return;
        }
        const selected = await ctx.ui.select("Select model + effort", modelProfiles.map(profileLabel));
        if (!selected) return;
        name = modelProfiles.find((profile) => profileLabel(profile) === selected)?.name ?? "";
      }
      const profile = modelProfiles.find((profile) => profile.name === name);
      if (!profile) {
        fail(ctx, `Unknown mode "${name}". Use fast, build, deep, or second.`);
        return;
      }
      if (!ctx.isIdle()) {
        fail(ctx, "Switch modes after the current run finishes, or cancel it first.");
        return;
      }
      const model = ctx.modelRegistry.find(profile.provider, profile.model);
      if (!model) {
        fail(ctx, `Mode ${name}: ${profile.provider}/${profile.model} is not in the model catalog.`);
        return;
      }
      let selected: boolean;
      try {
        selected = await pi.setModel(model);
      } catch (error) {
        fail(ctx, `Mode ${name}: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }
      if (!selected) {
        fail(ctx, `Mode ${name}: sign in to ${profile.provider} with /login first. Selection unchanged.`);
        return;
      }
      pi.setThinkingLevel(profile.thinkingLevel);
      failedSelection = undefined;
      const effective = pi.getThinkingLevel();
      const adjusted = effective !== profile.thinkingLevel;
      const message = `Mode ${name}: ${profile.provider}/${profile.model} · ${effective} effort${adjusted ? ` (requested ${profile.thinkingLevel}; adjusted to model support)` : ""}`;
      if (ctx.hasUI) ctx.ui.notify(message, adjusted ? "warning" : "info");
      else console.error(message);
    },
  });
}
