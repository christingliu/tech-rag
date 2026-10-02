import "./env";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

import { createEmbedding } from "../lib/embedding";
import {
  qdrant,
  COLLECTION_NAME,
  ensureCollection,
} from "../lib/qdrant";
import { splitText } from "../lib/chunk";
import { logger } from "../lib/logger";

import {
  recordIngestionRun,
  recordIngestionFailure,
  recordIngestionSkip,
  recordIngestionUpsert,
  recordIngestionDelete,
} from "../lib/metrics";

function createChunkId(
  source: string,
  contentHash: string
) {
  const hash = crypto
    .createHash("sha256")
    .update(`${source}:${contentHash}`)
    .digest("hex");

  // 转成合法 UUID 格式
  const bytes = Buffer.from(hash.slice(0, 32), "hex");

  // UUID v5
  bytes[6] =
    (bytes[6] & 0x0f) | 0x50;

  // RFC 4122 variant
  bytes[8] =
    (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString("hex");

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

type ExistingPoint = {
  id: string | number;
  payload?: Record<string, unknown> | null;
};

async function getExistingChunks(
  source: string
) {
  const points: ExistingPoint[] = [];

  let offset: string | number |Record<string, unknown>| null = null;

  while (true) {
    const result = await qdrant.scroll(
      COLLECTION_NAME,
      {
        filter: {
          must: [
            {
              key: "source",
              match: {
                value: source,
              },
            },
          ],
        },
        limit: 100,
        with_payload: true,
        with_vector: false,
        offset,
      }
    );

    points.push(...result.points);

    if (result.next_page_offset == null) {
      break;
    }

    offset = result.next_page_offset;
  }

  return points;
}

async function ingestFile(
  filePath: string,
  runId:string
) {
  const startedAt =
    Date.now();

  const relativePath = path.relative(
    path.join(process.cwd(), "knowledge"),
    filePath
  );
 
  try{
  const content = await fs.readFile(
    filePath,
    "utf-8"
  );

  const chunks = splitText(
    content,
    relativePath
  );

  logger.info(
    "ingestion.file.start",
    {
      runId,
      source: relativePath,
      chunkCount: chunks.length,
    }
  );

  // 查询这个文件之前已经存在的 chunks
  const existingChunks =
    await getExistingChunks(relativePath);

  const existingMap = new Map<
    string,
    {
      id: string | number;
      contentHash?: string;
    }
  >();

  for (const point of existingChunks) {
    const payload = point.payload;
    const raw =
      payload && typeof payload === "object"
        ? (payload as { contentHash?: unknown }).contentHash
        : undefined;

    existingMap.set(String(point.id), {
      id: point.id,
      contentHash:
        typeof raw === "string" ? raw : undefined,
    });
  }

  const currentIds = new Set<string>();

  for (const chunk of chunks) {
    const pointId = createChunkId(
      chunk.metadata.source,
      chunk.metadata.contentHash
    );

    currentIds.add(pointId);

    const existing =
      existingMap.get(pointId);

    // 内容完全没有变化
    if (
      existing &&
      existing.contentHash ===
        chunk.metadata.contentHash
    ) {
      recordIngestionSkip();
      logger.info(
        "ingestion.chunk.skip",
        {
          runId,
          source: relativePath,
          chunkIndex:
            chunk.metadata.chunkIndex,
          contentHash:
            chunk.metadata.contentHash,
        }
      );

      continue;
    }

    logger.info(
      "ingestion.chunk.upsert",
      {
        runId,
        source: relativePath,
        chunkIndex:
          chunk.metadata.chunkIndex,
        contentHash:
          chunk.metadata.contentHash,
      }
    );

    const chunkStartedAt = Date.now();

    let vector: number[];

    try {
      vector =
        await createEmbedding(
          chunk.content
        );
    } catch (error) {
      logger.error(
        "ingestion.chunk.failed",
        {
          runId,
          source: relativePath,
          chunkIndex:
            chunk.metadata.chunkIndex,
          contentHash:
            chunk.metadata.contentHash,
          stage: "embedding",
          durationMs:
            Date.now() -
            chunkStartedAt,
          error,
        }
      );

      throw error;
    }

    try {
      await qdrant.upsert(
        COLLECTION_NAME,
        {
          wait: true,
          points: [
            {
              id: pointId,
              vector,
              payload: {
                content:
                  chunk.content,
                title:
                  chunk.metadata.title,
                section:
                  chunk.metadata.section,
                source:
                  chunk.metadata.source,
                chunkIndex:
                  chunk.metadata.chunkIndex,
                contentHash:
                  chunk.metadata.contentHash,
              },
            },
          ],
        }
      );
    } catch (error) {
      logger.error(
        "ingestion.chunk.failed",
        {
          runId,
          source: relativePath,
          chunkIndex:
            chunk.metadata.chunkIndex,
          contentHash:
            chunk.metadata.contentHash,
          stage: "qdrant_upsert",
          durationMs:
            Date.now() -
            chunkStartedAt,
          error,
        }
      );
    
      throw error;
    }
    
    recordIngestionUpsert();
  }

  // 删除这个文件已经不存在的旧 chunks
  const staleIds = existingChunks
    .filter(
      (point) =>
        !currentIds.has(String(point.id))
    )
    .map((point) => point.id);

  if (staleIds.length > 0) {
    logger.info(
      "ingestion.chunk.delete_stale",
      {
        source: relativePath,
        count: staleIds.length,
      }
    );

    await qdrant.delete(
      COLLECTION_NAME,
      {
        wait: true,
        points: staleIds,
      }
    );
  }

  recordIngestionDelete(
    staleIds.length
  );

  logger.info(
    "ingestion.file.completed",
    {
      runId,
      source: relativePath,
      chunkCount: chunks.length,
      durationMs:
        Date.now() - startedAt,
    }
  );
  }catch (error) {
    logger.error(
      "ingestion.file.failed",
      {
        runId,
        source: relativePath,
        stage: "file_processing",
        durationMs:
          Date.now() - startedAt,
        error,
      }
    );

    throw error;
  }
}

async function deleteRemovedFiles(
  currentSources: Set<string>,
  runId:string
) {
  /*
   * 一次全量 scroll 收集 source → pointIds 映射，
   * 后面直接按 ID 删除，
   * 省掉逐个 source 的二次 scroll 网络往返。
   */
  const existingBySource =
    new Map<
      string,
      Array<string | number>
    >();

  let offset: string | number | Record<string, unknown> | null = null;

  while (true) {
    const result = await qdrant.scroll(
      COLLECTION_NAME,
      {
        limit: 100,
        with_payload: true,
        with_vector: false,
        offset,
      }
    );

    for (const point of result.points) {
      const source =
        point.payload?.source;

      if (
        typeof source === "string"
      ) {
        const ids =
          existingBySource.get(source);

        if (ids) {
          ids.push(point.id);
        } else {
          existingBySource.set(
            source,
            [point.id]
          );
        }
      }
    }

    if (result.next_page_offset == null) {
      break;
    }

    offset = result.next_page_offset;
  }

  const removedSources =
    [...existingBySource.keys()].filter(
      (source) =>
        !currentSources.has(source)
    );

  for (const source of removedSources) {
    const pointIds =
      existingBySource.get(source) ?? [];

    if (pointIds.length === 0) {
      continue;
    }

    logger.info(
      "ingestion.file.delete",
      {
        runId,
        source,
      }
    );

    await qdrant.delete(
      COLLECTION_NAME,
      {
        wait: true,
        points: pointIds,
      }
    );
  }
}

async function getMarkdownFiles(
  dir: string
): Promise<string[]> {
  const entries = await fs.readdir(dir, {
    withFileTypes: true,
  });

  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(
      dir,
      entry.name
    );

    if (entry.isDirectory()) {
      files.push(
        ...(await getMarkdownFiles(fullPath))
      );
    } else if (
      entry.name.endsWith(".md")
    ) {
      files.push(fullPath);
    }
  }

  return files;
}

async function main() {
  const startedAt =
    Date.now();

  const runId =
    crypto.randomUUID();

  logger.info(
    "ingestion.started",
    {
      runId,
    }
  );

  try {
    await ensureCollection();

    const knowledgePath =
      path.join(
        process.cwd(),
        "knowledge"
      );

    const files =
      await getMarkdownFiles(
        knowledgePath
      );

    const currentSources =
      new Set<string>();

    for (const file of files) {
      const relativePath =
        path.relative(
          knowledgePath,
          file
        );

      currentSources.add(
        relativePath
      );

      await ingestFile(
        file,
        runId
      );
    }

    await deleteRemovedFiles(
      currentSources,
      runId
    );

    const durationMs =
      Date.now() - startedAt;

    recordIngestionRun(
      durationMs
    );

    logger.info(
      "ingestion.completed",
      {
        runId,
        durationMs,
      }
    );
  } catch (error) {
    recordIngestionFailure();

    logger.error(
      "ingestion.failed",
      {
        runId,
        stage: "pipeline",
        durationMs:
          Date.now() - startedAt,
        error,
      }
    );

    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});