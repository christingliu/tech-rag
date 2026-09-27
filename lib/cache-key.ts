import type { RetrievalFilter } from "./rag";

const CACHE_KEY_VERSION = "v1";

const MODEL = "gpt-4o-mini";

const PROMPT_VERSION = "v4.3";

/**
 * Cache Key 的组成参数
 */
interface CacheKeyInput {
  question: string;
  filter?: RetrievalFilter;
  model?: string;
  promptVersion?: string;
}

/**
 * 对对象进行稳定序列化。
 *
 * 目的：
 * 避免对象属性顺序不同导致生成不同的 Cache Key。
 *
 * 例如：
 *
 * { title: "Hooks", source: "react" }
 *
 * 和
 *
 * { source: "react", title: "Hooks" }
 *
 * 应该生成相同的 Key。
 */
function stableStringify(
  value: unknown
): string {
  if (value === null) {
    return "null";
  }

  if (
    typeof value !== "object"
  ) {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value
      .map(stableStringify)
      .join(",")}]`;
  }

  const object =
    value as Record<string, unknown>;

  const keys = Object.keys(object).sort();

  return `{${keys
    .map(
      (key) =>
        `${JSON.stringify(key)}:${stableStringify(
          object[key]
        )}`
    )
    .join(",")}}`;
}

/**
 * 生成 RAG Cache Key。
 *
 * 相同的：
 * - question
 * - filter
 * - model
 * - promptVersion
 *
 * 应该生成相同的 Key。
 */
export function createCacheKey({
  question,
  filter,
  model = MODEL,
  promptVersion = PROMPT_VERSION,
}: CacheKeyInput): string {
  const normalizedQuestion =
    question.trim();

  const normalizedFilter =
    filter ?? {};

  const payload = {
    version: CACHE_KEY_VERSION,
    question: normalizedQuestion,
    filter: normalizedFilter,
    model,
    promptVersion,
  };

  return stableStringify(payload);
}