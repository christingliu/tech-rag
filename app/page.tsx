"use client";

import { useEffect, useState } from "react";
import Markdown from "react-markdown";
import type { CitationValidation } from "@/lib/citation";

type Source = {
  id: number;
  source: string;
  title: string;
  score?: number;
  section: string;
  chunkIndex: number;
  rrfScore?: number;
  rerankScore?: number | null;
};

type ChatResult = {
  answer: string;
  sources: Source[];
};

type FilterKey = "title" | "source" | "section";

type FilterState = Record<FilterKey, string>;

type FilterOptions = Record<
  FilterKey,
  string[]
>;

const EMPTY_FILTER: FilterState = {
  title: "",
  source: "",
  section: "",
};

const FILTER_LABELS: Record<
  FilterKey,
  string
> = {
  title: "标题 (title)",
  source: "文档 (source)",
  section: "小节 (section)",
};

export default function Home() {
  const [question, setQuestion] =
    useState("");

  const [data, setData] =
    useState<ChatResult | null>(null);

  const [answer, setAnswer] =
    useState("");

  const [
    citationValidation,
    setCitationValidation,
  ] =
    useState<CitationValidation | null>(
      null
    );

  const [error, setError] =
    useState<string | null>(null);

  const [loading, setLoading] =
    useState(false);

  const [
    filterOptions,
    setFilterOptions,
  ] =
    useState<FilterOptions | null>(
      null
    );

  const [filters, setFilters] =
    useState<FilterState>(
      EMPTY_FILTER
    );

  useEffect(() => {
    fetch("/api/filters")
      .then((response) =>
        response.ok
          ? response.json()
          : null
      )
      .then((json) => {
        if (json && !json.error) {
          setFilterOptions({
            title: json.titles ?? [],
            source: json.sources ?? [],
            section:
              json.sections ?? [],
          });
        }
      })
      .catch(() => {
        // 加载筛选项失败时，
        // 下拉框仅保留“全部”选项
      });
  }, []);

  async function onSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const trimmed =
      question.trim();

    if (!trimmed || loading) {
      return;
    }

    setLoading(true);
    setError(null);
    setData(null);
    setAnswer("");
    setCitationValidation(null);

    const filter: Partial<
      Record<FilterKey, string>
    > = {};

    if (filters.title) {
      filter.title =
        filters.title;
    }

    if (filters.source) {
      filter.source =
        filters.source;
    }

    if (filters.section) {
      filter.section =
        filters.section;
    }

    try {
      const response =
        await fetch(
          "/api/streamchat",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              question: trimmed,
              filter,
            }),
          }
        );

      /*
       * Streaming 开始之前发生的错误，
       * 后端仍然会返回 JSON。
       */
      if (!response.ok) {
        const json =
          await response.json();

        setError(
          json.error ??
            "Request failed"
        );

        return;
      }

      /*
       * 如果后端返回的是普通 JSON，
       * 这里兼容一下。
       *
       * 当前后端在没有检索结果时，
       * 会返回 application/json。
       */
      const contentType =
        response.headers.get(
          "content-type"
        );

      if (
        contentType?.includes(
          "application/json"
        )
      ) {
        const json =
          await response.json();

        setData({
          answer:
            json.answer ?? "",
          sources:
            json.sources ?? [],
        });

        setAnswer(
          json.answer ?? ""
        );

        return;
      }

      /*
       * ============================
       * V4.3 SSE Streaming
       * ============================
       */

      if (!response.body) {
        throw new Error(
          "Response body is empty"
        );
      }

      const reader =
        response.body.getReader();

      const decoder =
        new TextDecoder("utf-8");

      /*
       * SSE event 可能被网络拆成多个 chunk，
       * 所以需要使用 buffer 暂存。
       */
      let buffer = "";

      /*
       * 保存当前完整回答。
       */
      let fullAnswer = "";

      while (true) {
        const {
          value,
          done,
        } = await reader.read();
        if (done) {
          break;
        }

        /*
         * 将当前网络 chunk
         * 添加到 buffer。
         */
        buffer += decoder.decode(
          value,
          {
            stream: true,
          }
        );
        console.log(buffer,'buffer');
        /*
         * SSE event 之间通过 \n\n 分隔。
         */
        const events =
          buffer.split("\n\n");
        console.log(events,'events');
        /*
         * 最后一个 event 可能还不完整，
         * 留在 buffer 中等待下一次 chunk。
         */
        buffer =
          events.pop() ?? "";
        //console.log(buffer,'buffer2');
        //console.log(events,'events')
        for (const eventText of events) {
          if (!eventText.trim()) {
            continue;
          }

          let eventName = "";
          let dataText = "";

          /*
           * 一个 SSE event：

           * event: token
           * data: {"content":"React"}
           */
          const lines =
            eventText.split("\n");

          for (const line of lines) {
            if (
              line.startsWith(
                "event:"
              )
            ) {
              eventName =
                line
                  .slice(6)
                  .trim();
            }

            if (
              line.startsWith(
                "data:"
              )
            ) {
              dataText +=
                line
                  .slice(5)
                  .trim();
            }
          }
          console.log(eventName,'eventName');
          console.log(dataText,'dataText');
          /*
           * 没有 event 或 data，
           * 忽略。
           */
          if (
            !eventName ||
            !dataText
          ) {
            continue;
          }

          let eventData: any;

          try {
            eventData =
              JSON.parse(
                dataText
              );
            console.log(eventData,'eventData');
          } catch (error) {
            console.error(
              "[SSE] Failed to parse data:",
              dataText,
              error
            );

            continue;
          }

          /*
           * ==========================
           * token
           * ==========================
           *
           * LLM 每生成一段内容，
           * 后端发送一个 token event。
           */
          switch (eventName) {
            case "token": {
              const content =
                eventData.content ??
                "";

              fullAnswer +=
                content;
              console.log(fullAnswer,'fullAnswer');
              setAnswer(
                fullAnswer
              );

              break;
            }

            /*
             * ==========================
             * sources
             * ==========================
             *
             * RAG 检索到的最终 Sources。
             */
            case "sources": {
              const sources =
                eventData.sources ??
                [];

              setData({
                answer:
                  fullAnswer,
                sources,
              });

              break;
            }

            /*
             * ==========================
             * citation_validation
             * ==========================
             *
             * Citation 校验结果。
             */
            case "citation_validation": {
              setCitationValidation(
                eventData
              );

              break;
            }

            /*
             * ==========================
             * done
             * ==========================
             */
            case "done": {
              console.log(
                "[SSE] done:",
                eventData
              );
            
              if (
                typeof eventData.requestId ===
                "string"
              ) {
                console.log(
                  "[RAG Request ID]",
                  eventData.requestId
                );
              }

              break;
            }

            /*
             * ==========================
             * error
             * ==========================
             */
            case "error": {
              throw new Error(
                eventData.error ??
                  "Streaming failed"
              );
            }

            default: {
              console.warn(
                "[SSE] Unknown event:",
                eventName
              );
            }
          }
        }
      }

      /*
       * decoder 可能还有最后残留的 UTF-8 字节。
       */
      buffer += decoder.decode();
      console.log(buffer,'buffer');
      /*
       * 正常情况下，done 之前应该已经处理完
       * 所有完整 SSE event。
       *
       * 如果这里还有内容，暂时打印出来方便调试。
       */
      if (buffer.trim()) {
        console.log(
          "[SSE] Remaining buffer:",
          buffer
        );
      }

      /*
       * 如果整个过程中没有收到 sources event，
       * 至少保证 data 中存在当前回答。
       */
      setData((previous) => ({
        answer: fullAnswer,
        sources:
          previous?.sources ?? [],
      }));
    } catch (error) {
      console.error(
        "[UI] Chat failed:",
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : "Network error"
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-16 sm:px-10">

        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
            Tech RAG
          </h1>

          <p className="text-zinc-600 dark:text-zinc-400">
            Ask a question against the ingested knowledge base.
          </p>
        </header>

        <form
          onSubmit={onSubmit}
          className="flex flex-col gap-3"
        >
          <textarea
            value={question}
            onChange={(event) =>
              setQuestion(
                event.target.value
              )
            }
            placeholder="例如：useEffect 的 cleanup 什么时候执行？"
            rows={4}
            className="w-full resize-y rounded-xl border border-black/[.08] bg-white px-4 py-3 text-base text-black outline-none focus:border-black/30 dark:border-white/[.145] dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-white/40"
          />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(
              [
                "source",
                "title",
                "section",
              ] as FilterKey[]
            ).map((key) => (
              <label
                key={key}
                className="flex flex-col gap-1 text-sm text-zinc-600 dark:text-zinc-400"
              >
                {FILTER_LABELS[key]}

                <select
                  value={filters[key]}
                  onChange={(event) =>
                    setFilters(
                      (prev) => ({
                        ...prev,
                        [key]:
                          event.target
                            .value,
                      })
                    )
                  }
                  className="h-10 rounded-xl border border-black/[.08] bg-white px-3 text-base text-black outline-none focus:border-black/30 dark:border-white/[.145] dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-white/40"
                >
                  <option value="">
                    全部
                  </option>

                  {(
                    filterOptions?.[
                      key
                    ] ?? []
                  ).map(
                    (option) => (
                      <option
                        key={option}
                        value={option}
                      >
                        {option}
                      </option>
                    )
                  )}
                </select>
              </label>
            ))}
          </div>

          <button
            type="submit"
            disabled={
              loading ||
              !question.trim()
            }
            className="h-11 w-fit rounded-full bg-foreground px-5 text-sm font-medium text-background disabled:opacity-50"
          >
            {loading
              ? "正在生成…"
              : "提问"}
          </button>
        </form>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        {/*
         * Streaming 过程中，
         * answer 会随着 token event 不断变化。
         */}
        {answer && (
          <section className="flex flex-col gap-6">

            {/* =========================
                Answer
                ========================= */}
            <div className="prose-custom text-base leading-7 text-zinc-800 dark:text-zinc-200">
              <Markdown>
                {answer}
              </Markdown>
            </div>

            {/* =========================
                Citation Validation
                ========================= */}
            {citationValidation && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-zinc-500">
                  Citation:
                </span>

                <span
                  className={
                    citationValidation.status ===
                    "valid"
                      ? "font-medium text-green-600"
                      : citationValidation.status ===
                        "missing"
                      ? "font-medium text-yellow-600"
                      : "font-medium text-red-600"
                  }
                >
                  {citationValidation.status}
                </span>

                <span className="text-zinc-400">
                  ({citationValidation.citationCount}{" "}
                  citations)
                </span>
              </div>
            )}

            {/* =========================
                Sources
                ========================= */}
            {data &&
              data.sources.length >
                0 && (
                <div className="flex flex-col gap-2">
                  <h3 className="text-sm font-medium text-zinc-500">
                    Sources
                  </h3>

                  {data.sources.map(
                    (source) => (
                      <div
                        key={source.id}
                        className="rounded-lg border border-black/[.08] px-3 py-2 text-sm dark:border-white/[.145]"
                      >
                        <strong>
                          [{source.id}]{" "}
                          {source.title}
                        </strong>

                        <br />

                        {source.source}

                        <br />

                        {source.section}

                        <br />

                        RRF:{" "}
                        {source.rrfScore ??
                          "-"}

                        <br />

                        Rerank:{" "}
                        {source.rerankScore ??
                          "-"}

                        <br />

                        Chunk:{" "}
                        {
                          source.chunkIndex
                        }
                      </div>
                    )
                  )}
                </div>
              )}
          </section>
        )}
      </main>
    </div>
  );
}