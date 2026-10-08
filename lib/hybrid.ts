export interface HybridDocument {
  content: string;
  source: string;
  title: string;
  section: string;
  chunkIndex: number;

  /**
   * Parent-Child 关系字段（可选）。
   *
   * Vector / Keyword 检索从 payload 带回，
   * RRF spread 时透传给下游 expandParents。
   */
  parentId?: string;
  parentContent?: string;
}

export interface HybridResult
  extends HybridDocument {
  rrfScore: number;
}

export function reciprocalRankFusion(
  vectorResults: HybridDocument[],
  keywordResults: HybridDocument[],
  limit = 10
): HybridResult[] {
  const k = 60;

  const scores = new Map<
    string,
    {
      document: HybridDocument;
      rrfScore: number;
    }
  >();

  vectorResults.forEach((document, index) => {
    const key = getDocumentKey(document);

    const score = 1 / (k + index + 1);

    const current = scores.get(key);

    if (current) {//key可能有重复的，所以需要将rrfScore叠加
      current.rrfScore += score;
    } else {
      scores.set(key, {
        document,
        rrfScore: score,
      });
    }
  });

  keywordResults.forEach((document, index) => {
    const key = getDocumentKey(document);

    const score = 1 / (k + index + 1);

    const current = scores.get(key);

    if (current) {
      current.rrfScore += score;
    } else {
      scores.set(key, {
        document,
        rrfScore: score,
      });
    }
  });

  return Array.from(scores.values())
    .sort(
      (a, b) =>
        b.rrfScore - a.rrfScore
    )
    .slice(0, limit)
    .map((item) => ({
      ...item.document,
      rrfScore: item.rrfScore,
    }));
}

function getDocumentKey(
  document: HybridDocument
) {
  return `${document.source}:${document.chunkIndex}`;
}