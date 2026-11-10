import type { UnifiedEvidence } from "./unified-evidence";

export interface LlmAnswerPayload {
  answer: string;
  citations: string[];
}

export interface AgentAnswerCitation {
  evidenceId: string;
  source: string;
  title: string;
  section: string;
  chunkIndex: number;
}

export interface AgentAnswer {
  answer: string;
  citations: AgentAnswerCitation[];
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

/**
 * 解析 LLM 返回的结构化答案。
 */
export function parseLlmAnswer(
  raw: string,
): LlmAnswerPayload {
  let value: unknown;

  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("INVALID_ANSWER_JSON");
  }

  if (!isRecord(value)) {
    throw new Error("INVALID_ANSWER_PAYLOAD");
  }

  if (
    typeof value.answer !== "string" ||
    !value.answer.trim()
  ) {
    throw new Error("EMPTY_ANSWER");
  }

  if (
    !Array.isArray(value.citations) ||
    !value.citations.every(
      (item) =>
        typeof item === "string" &&
        item.trim().length > 0,
    )
  ) {
    throw new Error("INVALID_ANSWER_CITATIONS");
  }

  return {
    answer: value.answer.trim(),
    citations: value.citations,
  };
}

/**
 * 将模型返回的 Evidence ID 映射为真实来源。
 *
 * 只允许引用本轮实际进入 LLM Context 的 Evidence。
 */
export function resolveAgentAnswer(
  payload: LlmAnswerPayload,
  includedEvidence: UnifiedEvidence[],
): AgentAnswer {
  const evidenceById = new Map(
    includedEvidence.map((item) => [
      item.id,
      item,
    ]),
  );

  const uniqueIds = [
    ...new Set(payload.citations),
  ];

  const citations = uniqueIds.map((id) => {
    const evidence = evidenceById.get(id);

    if (!evidence) {
      throw new Error(
        `UNKNOWN_EVIDENCE_CITATION: ${id}`,
      );
    }

    return {
      evidenceId: evidence.id,
      source: evidence.metadata.source,
      title: evidence.metadata.title,
      section: evidence.metadata.section,
      chunkIndex: evidence.metadata.chunkIndex,
    };
  });

  return {
    answer: payload.answer,
    citations,
  };
}