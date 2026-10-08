import crypto from "crypto";

export interface ParentChunk {
  id: string;

  content: string;

  metadata: {
    source: string;
    title: string;
    section: string;
    headingPath: string[];
    contentHash: string;
  };
}

export interface Chunk {
  id: string;

  content: string;

  metadata: {
    source: string;
    title: string;
    section: string;
    headingPath: string[];

    chunkIndex: number;

    /**
     * Parent identity.
     *
     * Child Retrieval 命中 Child 后，
     * 通过 parentId 找回完整 Parent Context。
     */
    parentId: string;

    parentContent: string;

    contentHash: string;
  };
}

interface Section {
  headingPath: string[];
  content: string;
}

/**
 * Content Hash
 */
function createContentHash(
  content: string
): string {
  return crypto
    .createHash("sha256")
    .update(content)
    .digest("hex");
}

/**
 * Normalize heading path。
 *
 * 避免因为多余空格导致同一个 Section
 * 生成不同的 Parent ID。
 */
function normalizeHeadingPath(
  headingPath: string[]
): string[] {
  return headingPath.map(
    (heading) => heading.trim()
  );
}

/**
 * 创建稳定的 Parent ID。
 *
 * Parent identity 不依赖 chunkIndex。
 *
 * 同一个：
 *
 * source + headingPath + content
 *
 * 会得到相同 Parent ID。
 */
function createParentId(
  source: string,
  headingPath: string[],
  content: string
): string {
  const normalizedPath =
    normalizeHeadingPath(
      headingPath
    );

  const identity = [
    "parent",
    source,
    normalizedPath.join(" > "),
    createContentHash(content),
  ].join(":");

  return crypto
    .createHash("sha256")
    .update(identity)
    .digest("hex");
}

/**
 * 创建稳定 Child ID。
 *
 * Child ID 不使用全局 chunkIndex，
 * 避免前面的 Section 增删导致整个文档
 * 后续 Child ID 漂移。
 */
function createChildId(
  source: string,
  parentId: string,
  childIndex: number,
  content: string
): string {
  const identity = [
    "child",
    source,
    parentId,
    childIndex,
    createContentHash(content),
  ].join(":");

  return crypto
    .createHash("sha256")
    .update(identity)
    .digest("hex");
}

/**
 * 将 Markdown 拆成 Parent + Child。
 *
 * Parent：
 *   一个完整 Markdown Section。
 *
 * Child：
 *   Parent 内部经过 chunkSize / overlap
 *   二次切分后的检索单元。
 */
export function splitText(
  text: string,
  source: string,
  chunkSize = 500,
  overlap = 100
): {
  parents: ParentChunk[];
  chunks: Chunk[];
} {
  const sections =
    parseMarkdownSections(text);

  const parents: ParentChunk[] = [];
  const chunks: Chunk[] = [];

  let chunkIndex = 0;

  for (const section of sections) {
    const headingPath =
      normalizeHeadingPath(
        section.headingPath
      );

    const title =
      headingPath[0] ?? "";

    const sectionName =
      headingPath[
        headingPath.length - 1
      ] ?? title;

    /**
     * Parent 保留完整 Section 内容。
     *
     * 注意：
     * Parent 不使用 chunkSize 限制。
     */
    const headingContext =
      headingPath
        .map(
          (heading, index) =>
            `${"#".repeat(index + 1)} ${heading}`
        )
        .join("\n");

    const parentContent =
      headingContext
        ? `${headingContext}\n\n${section.content}`
        : section.content;

    const normalizedParentContent =
      parentContent.trim();

    if (!normalizedParentContent) {
      continue;
    }

    /**
     * 一个 Markdown Section = 一个 Parent。
     */
    const parentId =
      createParentId(
        source,
        headingPath,
        normalizedParentContent
      );

    parents.push({
      id: parentId,

      content:
        normalizedParentContent,

      metadata: {
        source,
        title,
        section: sectionName,
        headingPath,
        contentHash:
          createContentHash(
            normalizedParentContent
          ),
      },
    });

    /**
     * Parent 内部继续按照原来的逻辑
     * 生成 Child。
     */
    const sectionChunks =
      splitLongText(
        normalizedParentContent,
        chunkSize,
        overlap
      );

    let childIndex = 0;

    for (const content of sectionChunks) {
      const normalizedContent =
        content.trim();

      if (!normalizedContent) {
        continue;
      }

      const childId =
        createChildId(
          source,
          parentId,
          childIndex,
          normalizedContent
        );

      chunks.push({
        id: childId,

        content:
          normalizedContent,

        metadata: {
          source,
          title,
          section: sectionName,
          headingPath,

          chunkIndex,

          parentId,

          parentContent:normalizedParentContent,
          
          contentHash:
            createContentHash(
              normalizedContent
            ),
        },
      });

      chunkIndex++;
      childIndex++;
    }
  }

  return {
    parents,
    chunks,
  };
}

/**
 * 将 Markdown 按 Heading 拆成 Section。
 */
function parseMarkdownSections(
  text: string
): Section[] {
  const lines =
    text.split("\n");

  const sections: Section[] = [];

  const headingStack: string[] = [];

  let currentContent = "";

  function flushSection() {
    const content =
      currentContent.trim();

    if (!content) {
      return;
    }

    sections.push({
      headingPath: [
        ...headingStack,
      ],

      content,
    });

    currentContent = "";
  }

  for (const line of lines) {
    const headingMatch =
      line.match(
        /^(#{1,6})\s+(.+)$/
      );

    if (headingMatch) {
      flushSection();

      const level =
        headingMatch[1].length;

      const heading =
        headingMatch[2].trim();

      headingStack.length =
        level - 1;

      headingStack[level - 1] =
        heading;

      continue;
    }

    currentContent +=
      `${line}\n`;
  }

  flushSection();

  return sections;
}

/**
 * 对超长 Section 进行二次切分。
 *
 * 优先按照段落切分，而不是直接 slice。
 */
function splitLongText(
  text: string,
  chunkSize: number,
  overlap: number
): string[] {
  if (text.length <= chunkSize) {
    return [text.trim()];
  }

  const paragraphs =
    text
      .split(/\n\s*\n/)
      .map(
        (paragraph) =>
          paragraph.trim()
      )
      .filter(Boolean);

  const chunks: string[] = [];

  let current = "";

  for (const paragraph of paragraphs) {
    const candidate = current
      ? `${current}\n\n${paragraph}`
      : paragraph;

    if (
      candidate.length <=
      chunkSize
    ) {
      current = candidate;
      continue;
    }

    if (current) {
      chunks.push(current);
    }

    /**
     * 单个 paragraph 本身就超过 chunkSize。
     */
    if (
      paragraph.length >
      chunkSize
    ) {
      const paragraphChunks =
        splitByCharacters(
          paragraph,
          chunkSize,
          overlap
        );

      chunks.push(
        ...paragraphChunks
      );

      current = "";
    } else {
      current = paragraph;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return addOverlap(
    chunks,
    overlap,
    chunkSize
  );
}

/**
 * 对特别长的单段文本进行字符级切分。
 */
function splitByCharacters(
  text: string,
  chunkSize: number,
  overlap: number
): string[] {
  const chunks: string[] = [];

  let start = 0;

  while (start < text.length) {
    const end = Math.min(
      start + chunkSize,
      text.length
    );

    const chunk =
      text
        .slice(start, end)
        .trim();

    if (chunk) {
      chunks.push(chunk);
    }

    if (
      end === text.length
    ) {
      break;
    }

    start =
      end - overlap;
  }

  return chunks;
}

/**
 * 给相邻 Chunk 添加 overlap。
 *
 * 注意：
 * overlap 只发生在同一个 Parent 内。
 */
function addOverlap(
  chunks: string[],
  overlap: number,
  chunkSize: number
): string[] {
  if (
    chunks.length <= 1 ||
    overlap <= 0
  ) {
    return chunks;
  }

  const result: string[] = [
    chunks[0],
  ];

  for (
    let i = 1;
    i < chunks.length;
    i++
  ) {
    const previous =
      result[
        result.length - 1
      ];

    const overlapText =
      previous.slice(
        Math.max(
          0,
          previous.length -
            overlap
        )
      );

    const current =
      `${overlapText}\n\n${chunks[i]}`;

    if (
      current.length <=
      chunkSize + overlap
    ) {
      result.push(
        current.trim()
      );
    } else {
      result.push(
        chunks[i]
      );
    }
  }

  return result;
}