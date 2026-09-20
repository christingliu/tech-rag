import {
  qdrant,
  COLLECTION_NAME,
} from "./qdrant";

export interface KeywordDocument {
  content: string;
  source: string;
  title: string;
  section: string;
  chunkIndex: number;
}

export interface KeywordSearchResult
  extends KeywordDocument {
  keywordScore: number;
}

export interface RetrievalFilter {
  title?: string | null;
  source?: string | null;
  section?: string | null;
}

export async function keywordSearch(
  query: string,
  limit = 10,
  filter?:RetrievalFilter
): Promise<KeywordSearchResult[]> {
  // =========================
  // 1. Get all documents
  // =========================

  const documents: KeywordDocument[] = [];

  let offset: string | number | null = null;

  do {
    const result =
      await qdrant.scroll(
        COLLECTION_NAME,
        {
          limit: 100,
          offset,
          with_payload: true,
          filter: filter
          ? {
              must: [
                ...(filter.source
                  ? [{ key: "source", match: { value: filter.source } }]
                  : []),
                ...(filter.title
                  ? [{ key: "title", match: { value: filter.title } }]
                  : []),
                ...(filter.section
                  ? [{ key: "section", match: { value: filter.section } }]
                  : []),
              ],
            }
          : undefined,
        }
      );

    for (const point of result.points) {
      documents.push({
        content:
          point.payload?.content as string,

        source:
          point.payload?.source as string,

        title:
          point.payload?.title as string,

        section:
          point.payload?.section as string,

        chunkIndex:
          point.payload?.chunkIndex as number,
      });
    }

    offset = result.next_page_offset as string | number | null;

  } while (offset !== null);

  // =========================
  // 2. Tokenize query
  // =========================

  const keywords = tokenize(query);

  // =========================
  // 3. Calculate keyword score
  // =========================

  const results = documents
    .map((document) => {
      const text = [
        document.title,
        document.section,
        document.content,
      ]
        .join(" ")
        .toLowerCase();

      let matchedKeywords = 0;

      for (const keyword of keywords) {
        if (text.includes(keyword)) {
          matchedKeywords++;
        }
      }

      const keywordScore =
        keywords.length > 0
          ? matchedKeywords /
            keywords.length
          : 0;

      return {
        ...document,
        keywordScore,
      };
    })

    // Only keep documents with
    // at least one matched keyword
    .filter(
      (document) =>
        document.keywordScore > 0
    )

    // Highest keyword score first
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
    .split(
      /[\s,，。！？?!.:：/]+/
    )
    .map((word) => word.trim())
    .filter(
      (word) => word.length > 1
    );
}