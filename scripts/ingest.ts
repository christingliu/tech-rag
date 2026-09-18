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
     console.log({
      index: chunk.metadata.chunkIndex,
      length: chunk.content.length,
      source: chunk.metadata.source,
      title: chunk.metadata.title,
      section: chunk.metadata.section,
    });
    //创建向量
    const vector = await createEmbedding(chunk.content);
    await qdrant.upsert(COLLECTION_NAME, {
      wait: true,
      points: [
        {
          id: crypto.randomUUID(),
          vector,
          payload: {
            content: chunk.content,
            title: chunk.metadata.title,
            section:chunk.metadata.section,
            source: chunk.metadata.source,
            chunkIndex: chunk.metadata.chunkIndex,
          },
        },
      ],
    });
  }
}

async function resetCollection() {
  const collections = await qdrant.getCollections();

  const exists = collections.collections.some(
    (collection) => collection.name === COLLECTION_NAME
  );

  if (exists) {
    console.log(
      `Deleting collection: ${COLLECTION_NAME}`
    );

    await qdrant.deleteCollection(COLLECTION_NAME);
  }

  await ensureCollection();

  console.log(
    `Collection ready: ${COLLECTION_NAME}`
  );
}

async function main() {
  await resetCollection();

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