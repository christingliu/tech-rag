import type { AgentToolName } from "./agent-controller";

export type QueryRoute =
  | {
      type: "tool";
      tool: AgentToolName;
      reason: string;
    }
  | {
      type: "direct_answer";
      reason: string;
    };