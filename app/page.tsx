"use client";

import { useEffect, useState } from "react";
import Markdown from "react-markdown";

type ChatResult = {
  answer: string;
  sources: { source: string; title:string;score: number,section:string,chunkIndex:number }[];
};

type FilterKey = "title" | "source" | "section";

type FilterState = Record<FilterKey, string>;

type FilterOptions = Record<FilterKey, string[]>;

const EMPTY_FILTER: FilterState = {
  title: "",
  source: "",
  section: "",
};

const FILTER_LABELS: Record<FilterKey, string> = {
  title: "标题 (title)",
  source: "文档 (source)",
  section: "小节 (section)",
};

export default function Home() {
  const [question, setQuestion] = useState("");
  const [data, setData] = useState<ChatResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTER);

  useEffect(() => {
    fetch("/api/filters")
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => {
        if (json && !json.error) {
          setFilterOptions({
            title: json.titles ?? [],
            source: json.sources ?? [],
            section: json.sections ?? [],
          });
        }
      })
      .catch(() => {
        // 加载筛选项失败时，下拉框仅保留“全部”选项
      });
  }, []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = question.trim();
    if (!trimmed || loading) {
      return;
    }

    setLoading(true);
    setError(null);
    setData(null);

    const filter: Partial<Record<FilterKey, string>> = {};

    if (filters.title) filter.title = filters.title;
    if (filters.source) filter.source = filters.source;
    if (filters.section) filter.section = filters.section;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: trimmed,
          filter,
        }),
      });

      const json = await response.json();
      console.log(json,'json')
      if (!response.ok) {
        setError(json.error ?? "Request failed");
        return;
      }

      setData(json);
    } catch {
      setError("Network error");
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

        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="例如：useEffect 的 cleanup 什么时候执行？"
            rows={4}
            className="w-full resize-y rounded-xl border border-black/[.08] bg-white px-4 py-3 text-base text-black outline-none focus:border-black/30 dark:border-white/[.145] dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-white/40"
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(["source", "title", "section"] as FilterKey[]).map((key) => (
              <label
                key={key}
                className="flex flex-col gap-1 text-sm text-zinc-600 dark:text-zinc-400"
              >
                {FILTER_LABELS[key]}
                <select
                  value={filters[key]}
                  onChange={(event) =>
                    setFilters((prev) => ({
                      ...prev,
                      [key]: event.target.value,
                    }))
                  }
                  className="h-10 rounded-xl border border-black/[.08] bg-white px-3 text-base text-black outline-none focus:border-black/30 dark:border-white/[.145] dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-white/40"
                >
                  <option value="">全部</option>
                  {(filterOptions?.[key] ?? []).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <button
            type="submit"
            disabled={loading || !question.trim()}
            className="h-11 w-fit rounded-full bg-foreground px-5 text-sm font-medium text-background disabled:opacity-50"
          >
            {loading ? "正在检索…" : "提问"}
          </button>
        </form>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        {data && (
          <section className="flex flex-col gap-6">
            <div className="prose-custom text-base leading-7 text-zinc-800 dark:text-zinc-200">
              <Markdown>{data.answer}</Markdown>
            </div>

            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium text-zinc-500">Sources</h3>
              {data.sources.map((source, index) => (
                <div
                  key={`${source.source}-${index}`}
                  className="rounded-lg border border-black/[.08] px-3 py-2 text-sm dark:border-white/[.145]"
                >
                  {source.title}<br/>
                  {source.source}<br/>
                  {source.section}<br/>
                  {source.score}<br/>
                  {(source as any).rerankScore}<br/>
                  {source.chunkIndex}
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
