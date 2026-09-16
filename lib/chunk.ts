export interface Chunk {
  content: string;
  metadata: {
    source: string;
    chunkIndex: number;
  };
}

export function splitText(
  text: string,
  source: string,
  chunkSize = 500,
  overlap = 100
): Chunk[] {
  const chunks: Chunk[] = [];

  let start = 0;
  let chunkIndex = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);

    const content = text.slice(start, end).trim();

    if (content) {
      chunks.push({
        content,
        metadata: {
          source,
          chunkIndex,
        },
      });
    }

    if (end === text.length) {
      break;
    }

    start = end - overlap;
    chunkIndex++;
  }

  return chunks;
}