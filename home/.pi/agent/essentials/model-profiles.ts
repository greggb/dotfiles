import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export type ModelProfile = {
  name: "fast" | "build" | "deep" | "second";
  provider: string;
  model: string;
  thinkingLevel: ReturnType<ExtensionAPI["getThinkingLevel"]>;
  description: string;
};

export const modelProfiles: readonly ModelProfile[] = [
  { name: "fast", provider: "github-copilot", model: "gpt-6-luna", thinkingLevel: "medium", description: "Bounded assistance and mechanical work" },
  { name: "build", provider: "github-copilot", model: "gpt-6.1-sol", thinkingLevel: "medium", description: "Routine implementation and debugging" },
  { name: "deep", provider: "github-copilot", model: "gpt-6.1-sol", thinkingLevel: "high", description: "Architecture and difficult debugging" },
  { name: "second", provider: "github-copilot", model: "claude-opus-5.5", thinkingLevel: "high", description: "Another model's perspective in this conversation" },
];
