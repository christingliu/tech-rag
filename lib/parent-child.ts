export interface ParentExpandedDocument {
  content: string;

  source: string;
  title: string;
  section: string;

  parentId: string;

  /**
   * Parent Expansion 后，
   * 保留这个 Parent 最早命中的 Child 信息。
   *
   * 后续 Citation / Debug 可以继续使用。
   */
  matchedChildCount: number;

  rrfScore: number;
  rerankScore?: number | null;
}

interface RerankedChild {
  content: string;

  source: string;
  title: string;
  section: string;

  chunkIndex: number;

  parentId?: string;
  parentContent?: string;

  rrfScore: number;
  rerankScore?: number | null;
}

/**
 * 将 Reranked Child 扩展成 Parent Context。
 *
 * 核心原则：
 *
 * 1. Retrieval 仍然使用 Child
 * 2. 排序仍然使用 Child
 * 3. Context 使用 Parent
 * 4. 同一个 Parent 只保留一次
 * 5. Parent 顺序由它第一次命中的 Child 决定
 */
export function expandParents(
  children: RerankedChild[],
  limit = 3
): ParentExpandedDocument[] {
  const parents =
    new Map<
      string,
      ParentExpandedDocument
    >();

  for (const child of children) {
    if (!child.parentId) {
      continue;
    }

    if (!child.parentContent) {
      continue;
    }

    const existing =
      parents.get(
        child.parentId
      );

    if (existing) {
      existing.matchedChildCount++;

      continue;
    }

    parents.set(
      child.parentId,
      {
        content:
          child.parentContent,

        source:
          child.source,

        title:
          child.title,

        section:
          child.section,

        parentId:
          child.parentId,

        matchedChildCount: 1,

        rrfScore:
          child.rrfScore,

        rerankScore:
          child.rerankScore ?? null,
      }
    );

    if (
      parents.size >= limit
    ) {
      break;
    }
  }

  return Array.from(
    parents.values()
  );
}