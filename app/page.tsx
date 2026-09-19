"use client";

import { useState } from "react";
import Markdown from "react-markdown";

type ChatResult = {
  answer: string;
  sources: { source: string; title:string;score: number,chunkIndex:number }[];
};

export default function Home() {
  const [question, setQuestion] = useState("");
  const [data, setData] = useState<ChatResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = question.trim();
    if (!trimmed || loading) {
      return;
    }

    setLoading(true);
    setError(null);
    setData(null);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: trimmed,
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
