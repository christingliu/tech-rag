import "./env";
import fs from "fs/promises";
import path from "path";
import { createEmbedding } from "../lib/embedding";
import {
  qdrant,
  COLLECTION_NAME,
  ensureCollection,
} from "../lib/qdrant";
import { splitText } from "../lib/chunk";

async function ingestFile(filePath: string) {
  const content = await fs.readFile(filePath, "utf-8");
  const relativePath = path.relative(
    path.join(process.cwd(), "knowledge"),
    filePath
  );
  //分块
  const chunks = splitText(content, relativePath);

  console.log(`${relativePath}: ${chunks.length} chunks`);

  for (const chunk of chunks) {
    //创建向量
    const vector = await createEmbedding(chunk.content);
    console.log(vector,'vector');
    await qdrant.upsert(COLLECTION_NAME, {
      wait: true,
      points: [
        {
          id: crypto.randomUUID(),
          vector,
          payload: {
            content: chunk.content,
            source: chunk.metadata.source,
            chunkIndex: chunk.metadata.chunkIndex,
          },
        },
      ],
    });
  }
}

async function main() {
  await ensureCollection();

  const knowledgePath = path.join(
    process.cwd(),
    "knowledge"
  );

  const files = await getMarkdownFiles(knowledgePath);

  for (const file of files) {
    await ingestFile(file);
  }

  console.log("Ingestion completed.");
}

async function getMarkdownFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, {
    withFileTypes: true,
  });
  console.log(entries,'entries');
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await getMarkdownFiles(fullPath)));
    } else if (entry.name.endsWith(".md")) {
      files.push(fullPath);
    }
  }

  return files;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});