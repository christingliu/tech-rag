import "./env";

import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

import { createEmbedding } from "../lib/embedding";
import { createContextualContent } from "../lib/contextual";

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

/**
 * ============================================================
 * Chunk ID
 * ============================================================
 *
 * Child ID 基于：
 *
 * source + child contentHash
 *
 * 因此：
 *
 * 同样的 source + 同样的 Child 内容
 *       ↓
 * 相同 ID
 *
 * Child 内容发生变化
 *       ↓
 * 新 ID
 *
 * 这样可以支持 ingestion 幂等。
 */
function createChunkId(
  source: string,
  contentHash: string
): string {
  const hash = crypto
    .createHash("sha256")
    .update(`${source}:${contentHash}`)
    .digest("hex");

  /**
   * 转成合法 UUID 格式
   */
  const bytes = Buffer.from(
    hash.slice(0, 32),
    "hex"
  );

  /**
   * UUID v5
   */
  bytes[6] =
    (bytes[6] & 0x0f) | 0x50;

  /**
   * RFC 4122 variant
   */
  bytes[8] =
    (bytes[8] & 0x3f) | 0x80;

  const hex =
    bytes.toString("hex");

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

/**
 * ============================================================
 * Parent ID
 * ============================================================
 *
 * Parent 本身不作为独立 Vector Point。
 *
 * 它只是 Child 的逻辑父节点。
 *
 * Parent ID 基于：
 *
 * source + parentContent
 *
 * 因此同一个 source 中：
 *
 * 相同 Parent 内容
 *       ↓
 * 相同 parentId
 */
function createParentId(
  source: string,
  parentContent: string
): string {
  const parentHash =
    crypto
      .createHash("sha256")
      .update(
        `${source}:parent:${parentContent}`
      )
      .digest("hex");

  return `parent_${parentHash.slice(
    0,
    32
  )}`;
}

/**
 * ============================================================
 * Existing Qdrant Point
 * ============================================================
 */

type ExistingPoint = {
  id: string | number;

  payload?:
    | Record<string, unknown>
    | null;
};

/**
 * ============================================================
 * 查询某一个 source 已经存在的 Child
 * ============================================================
 *
 * 用于：
 *
 * 1. 判断 Child 是否已经存在
 * 2. 判断 contentHash 是否发生变化
 * 3. 删除已经不存在的旧 Child
 */
async function getExistingChunks(
  source: string
): Promise<ExistingPoint[]> {
  const points: ExistingPoint[] = [];

  let offset:
    | string
    | number
    | Record<string, unknown>
    | null = null;

  while (true) {
    const result =
      await qdrant.scroll(
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

    points.push(
      ...result.points
    );

    if (
      result.next_page_offset ==
      null
    ) {
      break;
    }

    offset =
      result.next_page_offset;
  }

  return points;
}

/**
 * ============================================================
 * Ingest 一个 Markdown 文件
 * ============================================================
 */
async function ingestFile(
  filePath: string,
  runId: string
) {
  const startedAt =
    Date.now();

  /**
   * knowledge/xxx.md
   *
   * ↓
   *
   * xxx.md
   *
   * 或：
   *
   * docs/react.md
   */
  const relativePath =
    path.relative(
      path.join(
        process.cwd(),
        "knowledge"
      ),
      filePath
    );

  try {
    /**
     * --------------------------------------------------------
     * 1. 读取 Markdown
     * --------------------------------------------------------
     */
    const content =
      await fs.readFile(
        filePath,
        "utf-8"
      );

    /**
     * --------------------------------------------------------
     * 2. Parent / Child 切割
     * --------------------------------------------------------
     *
     * splitText() 负责：
     *
     * Markdown
     *   ↓
     * Section / Parent
     *   ↓
     * Child
     *
     * 每一个 Child 应该包含：
     *
     * metadata:
     * {
     *   source,
     *   title,
     *   section,
     *   chunkIndex,
     *   contentHash,
     *
     *   parentId,
     *   parentContent
     * }
     */
    const {chunks} =
      splitText(
        content,
        relativePath
      );
    console.log(chunks,'chunks');
    logger.info(
      "ingestion.file.start",
      {
        runId,

        source:
          relativePath,

        chunkCount:
          chunks.length,
      }
    );

    /**
     * --------------------------------------------------------
     * 3. 查询旧 Child
     * --------------------------------------------------------
     */
    const existingChunks =
      await getExistingChunks(
        relativePath
      );

    /**
     * existingMap:
     *
     * Child ID
     *    ↓
     * {
     *   id,
     *   contentHash
     * }
     */
    const existingMap =
      new Map<
        string,
        {
          id: string | number;
          contentHash?: string;
        }
      >();

    for (
      const point of existingChunks
    ) {
      const payload =
        point.payload;

      const rawContentHash =
        payload &&
        typeof payload ===
          "object"
          ? (
              payload as {
                contentHash?: unknown;
              }
            ).contentHash
          : undefined;

      existingMap.set(
        String(point.id),
        {
          id: point.id,

          contentHash:
            typeof rawContentHash ===
            "string"
              ? rawContentHash
              : undefined,
        }
      );
    }

    /**
     * --------------------------------------------------------
     * 4. 当前 ingestion 的 Child ID
     * --------------------------------------------------------
     *
     * 最后用于删除 stale Child。
     */
    const currentIds =
      new Set<string>();

    /**
     * --------------------------------------------------------
     * 5. 逐个处理 Child
     * --------------------------------------------------------
     */
    for (
      const chunk of chunks
    ) {
      const metadata =
        chunk.metadata;

      /**
       * ------------------------------------------------------
       * Child ID
       * ------------------------------------------------------
       */
      const pointId =
        createChunkId(
          metadata.source,
          metadata.contentHash
        );

      currentIds.add(
        pointId
      );

      /**
       * ------------------------------------------------------
       * Parent ID
       * ------------------------------------------------------
       *
       * 如果 chunk.ts 已经生成 parentId，
       * 直接使用。
       *
       * 如果没有，则根据 parentContent
       * 兜底生成。
       */
      const parentContent =
        metadata.parentContent ??
        chunk.content;

      const parentId =
        metadata.parentId ??
        createParentId(
          metadata.source,
          parentContent
        );

      /**
       * ------------------------------------------------------
       * 判断 Child 是否已经存在
       * ------------------------------------------------------
       */
      const existing =
        existingMap.get(
          pointId
        );

      /**
       * ------------------------------------------------------
       * 内容完全没有变化
       * ------------------------------------------------------
       *
       * 不重新 Embedding。
       *
       * 不重新 Qdrant upsert。
       */
      if (
        existing &&
        existing.contentHash ===
          metadata.contentHash
      ) {
        recordIngestionSkip();

        logger.info(
          "ingestion.chunk.skip",
          {
            runId,

            source:
              relativePath,

            chunkIndex:
              metadata.chunkIndex,

            contentHash:
              metadata.contentHash,

            parentId,
          }
        );

        continue;
      }

      logger.info(
        "ingestion.chunk.upsert",
        {
          runId,

          source:
            relativePath,

          chunkIndex:
            metadata.chunkIndex,

          contentHash:
            metadata.contentHash,

          parentId,
        }
      );

      const chunkStartedAt =
        Date.now();

      /**
       * ======================================================
       * 6. Embedding
       * ======================================================
       */
      let vector: number[];

      try {
        const contextualContent =
          createContextualContent(
            chunk
          );
        vector =
          await createEmbedding(
            contextualContent
          );
      } catch (error) {
        logger.error(
          "ingestion.chunk.failed",
          {
            runId,

            source:
              relativePath,

            chunkIndex:
              metadata.chunkIndex,

            contentHash:
              metadata.contentHash,

            parentId,

            stage:
              "embedding",

            durationMs:
              Date.now() -
              chunkStartedAt,

            error,
          }
        );

        throw error;
      }

      /**
       * ======================================================
       * 7. 写入 Qdrant
       * ======================================================
       *
       * 注意：
       *
       * Qdrant 中存储的是 Child Vector。
       *
       * Parent 不单独生成 embedding。
       *
       * Parent 信息作为 payload 保存。
       */
      try {
        await qdrant.upsert(
          COLLECTION_NAME,
          {
            wait: true,

            points: [
              {
                /**
                 * Child Point ID
                 */
                id: pointId,

                /**
                 * Child Vector
                 */
                vector,

                /**
                 * =================================================
                 * Child Payload
                 * =================================================
                 */
                payload: {
                  /**
                   * Child 本身
                   */
                  content:
                    chunk.content,

                  /**
                   * 文档信息
                   */
                  source:
                    metadata.source,

                  title:
                    metadata.title,

                  section:
                    metadata.section,

                  chunkIndex:
                    metadata.chunkIndex,

                  /**
                   * Child 内容 Hash
                   */
                  contentHash:
                    metadata.contentHash,

                  /**
                   * =================================================
                   * Parent-Child 关系
                   * =================================================
                   *
                   * Child → Parent
                   */
                  parentId,

                  /**
                   * Parent 完整内容
                   *
                   * Retrieval 命中 Child 后，
                   * 可以直接拿这个字段作为 Context。
                   */
                  parentContent,
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

            source:
              relativePath,

            chunkIndex:
              metadata.chunkIndex,

            contentHash:
              metadata.contentHash,

            parentId,

            stage:
              "qdrant_upsert",

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

    /**
     * ========================================================
     * 8. 删除 Stale Child
     * ========================================================
     *
     * 例如旧版本：
     *
     * Parent A
     * ├── Child A1
     * ├── Child A2
     * └── Child A3
     *
     * Markdown 修改以后：
     *
     * Parent A
     * ├── Child A1
     * └── Child A2
     *
     * A3 已经不存在。
     *
     * ↓
     *
     * 删除 A3。
     */
    const staleIds =
      existingChunks
        .filter(
          (point) =>
            !currentIds.has(
              String(point.id)
            )
        )
        .map(
          (point) =>
            point.id
        );

    if (
      staleIds.length > 0
    ) {
      logger.info(
        "ingestion.chunk.delete_stale",
        {
          runId,

          source:
            relativePath,

          count:
            staleIds.length,
        }
      );

      await qdrant.delete(
        COLLECTION_NAME,
        {
          wait: true,

          points:
            staleIds,
        }
      );
    }

    recordIngestionDelete(
      staleIds.length
    );

    /**
     * ========================================================
     * 9. 文件完成
     * ========================================================
     */
    logger.info(
      "ingestion.file.completed",
      {
        runId,

        source:
          relativePath,

        chunkCount:
          chunks.length,

        durationMs:
          Date.now() -
          startedAt,
      }
    );
  } catch (error) {
    logger.error(
      "ingestion.file.failed",
      {
        runId,

        source:
          relativePath,

        stage:
          "file_processing",

        durationMs:
          Date.now() -
          startedAt,

        error,
      }
    );

    throw error;
  }
}

/**
 * ============================================================
 * 删除已经从 knowledge/ 中消失的文件
 * ============================================================
 */
async function deleteRemovedFiles(
  currentSources: Set<string>,
  runId: string
) {
  /**
   * 一次全量 scroll：
   *
   * source
   *   ↓
   * pointIds[]
   *
   * 后面直接按照 Point ID 删除。
   */
  const existingBySource =
    new Map<
      string,
      Array<string | number>
    >();

  let offset:
    | string
    | number
    | Record<string, unknown>
    | null = null;

  while (true) {
    const result =
      await qdrant.scroll(
        COLLECTION_NAME,
        {
          limit: 100,

          with_payload: true,

          with_vector: false,

          offset,
        }
      );

    for (
      const point of result.points
    ) {
      const source =
        point.payload?.source;

      if (
        typeof source !==
        "string"
      ) {
        continue;
      }

      const ids =
        existingBySource.get(
          source
        );

      if (ids) {
        ids.push(
          point.id
        );
      } else {
        existingBySource.set(
          source,
          [point.id]
        );
      }
    }

    if (
      result.next_page_offset ==
      null
    ) {
      break;
    }

    offset =
      result.next_page_offset;
  }

  /**
   * 当前 Qdrant 中存在，
   * 但 knowledge/ 已经不存在的 source。
   */
  const removedSources =
    [
      ...existingBySource.keys(),
    ].filter(
      (source) =>
        !currentSources.has(
          source
        )
    );

  /**
   * 删除这些 source 的所有 Child。
   */
  for (
    const source of removedSources
  ) {
    const pointIds =
      existingBySource.get(
        source
      ) ?? [];

    if (
      pointIds.length === 0
    ) {
      continue;
    }

    logger.info(
      "ingestion.file.delete",
      {
        runId,

        source,

        count:
          pointIds.length,
      }
    );

    await qdrant.delete(
      COLLECTION_NAME,
      {
        wait: true,

        points:
          pointIds,
      }
    );

    recordIngestionDelete(
      pointIds.length
    );
  }
}

/**
 * ============================================================
 * 获取所有 Markdown 文件
 * ============================================================
 */
async function getMarkdownFiles(
  dir: string
): Promise<string[]> {
  const entries =
    await fs.readdir(
      dir,
      {
        withFileTypes: true,
      }
    );

  const files: string[] = [];

  for (
    const entry of entries
  ) {
    const fullPath =
      path.join(
        dir,
        entry.name
      );

    if (
      entry.isDirectory()
    ) {
      files.push(
        ...(
          await getMarkdownFiles(
            fullPath
          )
        )
      );
    } else if (
      entry.name.endsWith(
        ".md"
      )
    ) {
      files.push(
        fullPath
      );
    }
  }

  return files;
}

/**
 * ============================================================
 * Main
 * ============================================================
 */
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
    /**
     * --------------------------------------------------------
     * 1. 确保 Qdrant Collection 存在
     * --------------------------------------------------------
     */
    await ensureCollection();

    /**
     * --------------------------------------------------------
     * 2. knowledge 目录
     * --------------------------------------------------------
     */
    const knowledgePath =
      path.join(
        process.cwd(),
        "knowledge"
      );

    /**
     * --------------------------------------------------------
     * 3. 获取 Markdown 文件
     * --------------------------------------------------------
     */
    const files =
      await getMarkdownFiles(
        knowledgePath
      );

    logger.info(
      "ingestion.files.discovered",
      {
        runId,

        count:
          files.length,
      }
    );

    /**
     * --------------------------------------------------------
     * 4. 当前所有 source
     * --------------------------------------------------------
     */
    const currentSources =
      new Set<string>();

    /**
     * --------------------------------------------------------
     * 5. 逐文件 ingestion
     * --------------------------------------------------------
     */
    for (
      const file of files
    ) {
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

    /**
     * --------------------------------------------------------
     * 6. 删除已经不存在的文件
     * --------------------------------------------------------
     */
    await deleteRemovedFiles(
      currentSources,
      runId
    );

    /**
     * --------------------------------------------------------
     * 7. 完成
     * --------------------------------------------------------
     */
    const durationMs =
      Date.now() -
      startedAt;

    recordIngestionRun(
      durationMs
    );

    logger.info(
      "ingestion.completed",
      {
        runId,

        fileCount:
          files.length,

        durationMs,
      }
    );
  } catch (error) {
    /**
     * --------------------------------------------------------
     * Pipeline Failure
     * --------------------------------------------------------
     */
    recordIngestionFailure();

    logger.error(
      "ingestion.failed",
      {
        runId,

        stage:
          "pipeline",

        durationMs:
          Date.now() -
          startedAt,

        error,
      }
    );

    throw error;
  }
}

/**
 * ============================================================
 * Process Entry
 * ============================================================
 */
main().catch(
  (error) => {
    console.error(error);

    process.exit(1);
  }
);