import type { Chunk } from "./chunk";

export function createContextualContent(
  chunk: Chunk
): string {
  const {
    title,
    section,
    headingPath,
  } = chunk.metadata;

  const context =
    headingPath.length > 0
      ? headingPath.join(" > ")
      : [title, section]
          .filter(Boolean)
          .join(" > ");

  if (!context) {
    return chunk.content;
  }

  return [
    `Context: ${context}`,
    "",
    chunk.content,
  ].join("\n");
}