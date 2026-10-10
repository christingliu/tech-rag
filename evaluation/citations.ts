export interface ParsedCitation {
  sourceId: number;
  start: number;
  end: number;
}

export interface CitationValidation {
  citations: ParsedCitation[];
  validCitations: number;
  invalidCitations: number;
  contextSourceIds: number[];
}

/**
 * 解析答案中的 [Source N]。
 */
export function parseCitations(
  answer: string
): ParsedCitation[] {
  const citations: ParsedCitation[] = [];
  const regex = /\[Source\s+(\d+)\]/g;

  for (const match of answer.matchAll(regex)) {
    const sourceId = Number(match[1]);

    if (
      !Number.isSafeInteger(sourceId) ||
      sourceId <= 0 ||
      match.index === undefined
    ) {
      continue;
    }

    citations.push({
      sourceId,
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  return citations;
}

/**
 * 解析 Context 中实际存在的来源编号。
 */
export function parseContextSourceIds(
  context: string
): Set<number> {
  const sourceIds = new Set<number>();
  const regex = /^\s*\[Source\s+(\d+)\]\s*$/gm;

  for (const match of context.matchAll(regex)) {
    const sourceId = Number(match[1]);

    if (
      Number.isSafeInteger(sourceId) &&
      sourceId > 0
    ) {
      sourceIds.add(sourceId);
    }
  }

  return sourceIds;
}

/**
 * 验证引用是否指向当前 Context 中存在的来源。
 */
export function validateCitations(
  answer: string,
  context: string
): CitationValidation {
  const citations = parseCitations(answer);
  const sourceIds = parseContextSourceIds(context);

  const validCitations = citations.filter(
    (citation) => sourceIds.has(citation.sourceId)
  ).length;

  return {
    citations,
    validCitations,
    invalidCitations:
      citations.length - validCitations,
    contextSourceIds: Array.from(sourceIds),
  };
}