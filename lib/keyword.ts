export interface KeywordDocument {
  content: string;
  source: string;
  title: string;
  section: string;
  chunkIndex: number;
}

export function keywordSearch(
  query: string,
  documents: KeywordDocument[],
  limit = 10
) {
  const keywords = tokenize(query);

  const results = documents
    .map((document) => {
      const text = [
        document.title,
        document.section,
        document.content,
      ]
        .join(" ")
        .toLowerCase();

      let score = 0;

      for (const keyword of keywords) {
        if (text.includes(keyword)) {
          score++;
        }
      }

      return {
        ...document,
        keywordScore:
          keywords.length > 0
            ? score / keywords.length
            : 0,
      };
    })
    .filter(
      (document) => document.keywordScore > 0
    )
    .sort(
      (a, b) =>
        b.keywordScore -
        a.keywordScore
    );

  return results.slice(0, limit);
}

function tokenize(query: string) {
  return query
    .toLowerCase()
    .split(/[\s,，。！？?!.:：/]+/)
    .map((word) => word.trim())
    .filter(
      (word) => word.length > 1
    );
}