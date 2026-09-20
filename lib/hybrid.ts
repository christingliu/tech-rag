export interface RankedDocument {
  content: string;
  source: string;
  title: string;
  section: string;
  chunkIndex: number;
}

export function reciprocalRankFusion(
  vectorResults: RankedDocument[],
  keywordResults: RankedDocument[],
  limit = 10
) {
  const k = 60;

  const scores = new Map<
    string,
    {
      document: RankedDocument;
      score: number;
    }
  >();

  vectorResults.forEach(
    (document, index) => {
      const key = getDocumentKey(
        document
      );

      const current =
        scores.get(key);

      const score =
        1 / (k + index + 1);

      if (current) {
        current.score += score;
      } else {
        scores.set(key, {
          document,
          score,
        });
      }
    }
  );

  keywordResults.forEach(
    (document, index) => {
      const key = getDocumentKey(
        document
      );

      const current =
        scores.get(key);

      const score =
        1 / (k + index + 1);

      if (current) {
        current.score += score;
      } else {
        scores.set(key, {
          document,
          score,
        });
      }
    }
  );

  return Array.from(scores.values())
    .sort(
      (a, b) =>
        b.score - a.score
    )
    .slice(0, limit);
}

function getDocumentKey(
  document: RankedDocument
) {
  return [
    document.source,
    document.chunkIndex,
  ].join(":");
}