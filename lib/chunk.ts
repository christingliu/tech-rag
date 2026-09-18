export interface Chunk {
  content: string;

  metadata: {
    source: string;
    title: string;
    section: string;
    chunkIndex: number;
  };
}

interface Section {
  headingPath: string[];
  content: string;
}

/* 
 基于你现在的配置（limit=5, scoreThreshold=0.3, chunkSize=500），如果让我给一个调优顺序：
1.先建评估集（20 条 Q&A），跑 baseline，记下 Recall@5
2.加 metadata filter（前面那条消息讲过）→ 通常能把 Precision 提一截，因为缩小了搜索空间
3.调 scoreThreshold：从 0.3 起，每次 +0.1，看 Recall@5 什么时候开始掉，选"掉之前"的最大值
4.调 limit：5→8→10，看 Recall@5 还能不能涨，能涨就涨，涨不动就回到 5
5.回头看分块：如果上面都调不动了，问题在 chunk.ts，调 chunkSize 和 overlap
*/

export function splitText(
  text: string,
  source: string,
  chunkSize = 500,
  overlap = 100
): Chunk[] {
  const sections = parseMarkdownSections(text);

  const chunks: Chunk[] = [];

  let chunkIndex = 0;

  for (const section of sections) {
    const headingPath = section.headingPath;

    const title = headingPath[0] ?? "";

    const sectionName =
      headingPath[headingPath.length - 1] ?? title;

    const headingContext = headingPath
      .map((heading, index) => {
        return `${"#".repeat(index + 1)} ${heading}`;
      })
      .join("\n");

    const fullContent = headingContext
      ? `${headingContext}\n\n${section.content}`
      : section.content;

    const sectionChunks = splitLongText(
      fullContent,
      chunkSize,
      overlap
    );

    for (const content of sectionChunks) {
      chunks.push({
        content,

        metadata: {
          source,
          title,
          section: sectionName,
          chunkIndex,
        },
      });

      chunkIndex++;
    }
  }

  return chunks;
}

/**
 * 将 Markdown 按 Heading 拆成 Section
 */
function parseMarkdownSections(text: string): Section[] {
  const lines = text.split("\n");

  const sections: Section[] = [];

  const headingStack: string[] = [];

  let currentContent = "";

  function flushSection() {
    const content = currentContent.trim();

    if (!content) {
      return;
    }

    sections.push({
      headingPath: [...headingStack],
      content,
    });

    currentContent = "";
  }
  console.log(lines,'lines');
  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
     console.log(headingMatch,'headingMatch');
    if (headingMatch) {
      flushSection();

      const level = headingMatch[1].length;
      const heading = headingMatch[2].trim();

      headingStack.length = level - 1;
      headingStack[level - 1] = heading;

      continue;
    }

    currentContent += `${line}\n`;
  }

  flushSection();

  return sections;
}

/**
 * 对超长 Section 进行二次切分
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

  const paragraphs = text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const chunks: string[] = [];

  let current = "";

  for (const paragraph of paragraphs) {
    const candidate = current
      ? `${current}\n\n${paragraph}`
      : paragraph;

    if (candidate.length <= chunkSize) {
      current = candidate;
      continue;
    }

    if (current) {
      chunks.push(current);
    }

    // 单个 paragraph 本身就超过 chunkSize
    if (paragraph.length > chunkSize) {
      const paragraphChunks = splitByCharacters(
        paragraph,
        chunkSize,
        overlap
      );

      chunks.push(...paragraphChunks);

      current = "";
    } else {
      current = paragraph;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return addOverlap(chunks, overlap, chunkSize);
}

/**
 * 对特别长的单段文本进行字符级切分
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

    const chunk = text.slice(start, end).trim();

    if (chunk) {
      chunks.push(chunk);
    }

    if (end === text.length) {
      break;
    }

    start = end - overlap;
  }

  return chunks;
}

/**
 * 给相邻 Chunk 添加 overlap。
 *
 * 注意：
 * 这里使用前一个 Chunk 的尾部作为下一个 Chunk 的上下文。
 */
function addOverlap(
  chunks: string[],
  overlap: number,
  chunkSize: number
): string[] {
  if (chunks.length <= 1 || overlap <= 0) {
    return chunks;
  }

  const result: string[] = [chunks[0]];

  for (let i = 1; i < chunks.length; i++) {
    const previous = result[result.length - 1];

    const overlapText = previous.slice(
      Math.max(0, previous.length - overlap)
    );

    const current = `${overlapText}\n\n${chunks[i]}`;

    if (current.length <= chunkSize + overlap) {
      result.push(current.trim());
    } else {
      result.push(chunks[i]);
    }
  }

  return result;
}