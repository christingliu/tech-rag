export type RagErrorStage =
  | "rewrite"
  | "embedding"
  | "vector"
  | "keyword"
  | "hybrid"
  | "rerank"
  | "llm"
  | "hyde"
  | "retrieval"
  | "multi-query";

export class RagError extends Error {
  stage: RagErrorStage;
  cause?: unknown;

  constructor(
    stage: RagErrorStage,
    message: string,
    cause?: unknown
  ) {
    super(message);

    this.name = "RagError";
    this.stage = stage;
    this.cause = cause;
  }
}