"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

type LatencyMetric = {
  avg: number | null;
  p95: number | null;
};

type RagMetrics = {
  requests: number;
  successes: number;
  errors: number;

  errorRate: number;

  cacheHits: number;
  cacheMisses: number;

  cacheHitRate: number;

  latency: {
    rewrite: LatencyMetric;
    retrieval: LatencyMetric;
    keywordRetrieval: LatencyMetric;
    rerank: LatencyMetric;
    llm: LatencyMetric;
    total: LatencyMetric;
  };
};

export default function DebugPage() {
  const [metrics, setMetrics] =
    useState<RagMetrics | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const loadMetrics =
    useCallback(async () => {
      try {
        const response =
          await fetch("/api/metrics", {
            cache: "no-store",
          });

        if (!response.ok) {
          throw new Error(
            "Failed to load metrics"
          );
        }

        const data =
          await response.json();

        setMetrics(data);
        setError(null);
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : "Unknown error"
        );
      } finally {
        setLoading(false);
      }
    }, []);

    const resetMetrics =
    useCallback(async () => {
      await fetch(
        "/api/metrics/reset",
        {
          method: "POST"
        }
      );
  
      await loadMetrics();
    }, [loadMetrics]);

  useEffect(() => {
    loadMetrics();

    const timer =
      setInterval(
        loadMetrics,
        5000
      );

    return () =>
      clearInterval(timer);
  }, [loadMetrics]);

  if (loading && !metrics) {
    return (
      <main className="debug-page">
        <h1>RAG Observability</h1>

        <p>
          Loading metrics...
        </p>
      </main>
    );
  }

  return (
    <main className="debug-page">
      <div className="debug-header">
        <div>
          <h1>
            RAG Observability
          </h1>

          <p>
            Runtime metrics and
            latency overview
          </p>
        </div>

        <div
            style={{
            display: "flex",
            gap: 8,
            }}
        >
            <button
            onClick={loadMetrics}
            >
            Refresh
            </button>

            <button
            onClick={resetMetrics}
            style={{
                background: "#dc2626",
            }}
            >
            Reset
            </button>
        </div>

      </div>

      {error && (
        <div className="debug-error">
          {error}
        </div>
      )}

      {metrics && (
        <>
          <section className="metrics-grid">
            <MetricCard
              label="Requests"
              value={metrics.requests}
            />

            <MetricCard
              label="Success"
              value={metrics.successes}
            />

            <MetricCard
              label="Errors"
              value={metrics.errors}
            />

            <MetricCard
              label="Error Rate"
              value={formatPercent(
                metrics.errorRate
              )}
            />

            <MetricCard
              label="Cache Hits"
              value={metrics.cacheHits}
            />

            <MetricCard
              label="Cache Misses"
              value={
                metrics.cacheMisses
              }
            />

            <MetricCard
              label="Cache Hit Rate"
              value={formatPercent(
                metrics.cacheHitRate
              )}
            />
          </section>

          <section className="debug-section">
            <div className="section-header">
              <h2>Latency</h2>

              <span>
                Average / P95
              </span>
            </div>

            <LatencyTable
              metrics={metrics}
            />
          </section>

          <section className="debug-section">
            <div className="section-header">
              <h2>Raw Metrics</h2>
            </div>

            <pre className="metrics-json">
              {JSON.stringify(
                metrics,
                null,
                2
              )}
            </pre>
          </section>
        </>
      )}
    </main>
  );
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="metric-card">
      <div className="metric-label">
        {label}
      </div>

      <div className="metric-value">
        {value}
      </div>
    </div>
  );
}

function LatencyTable({
  metrics,
}: {
  metrics: RagMetrics;
}) {
  const rows = [
    [
      "Query Rewrite",
      metrics.latency.rewrite,
    ],
    [
      "Vector Retrieval",
      metrics.latency.retrieval,
    ],
    [
      "Keyword Retrieval",
      metrics.latency
        .keywordRetrieval,
    ],
    [
      "Rerank",
      metrics.latency.rerank,
    ],
    [
      "LLM",
      metrics.latency.llm,
    ],
    [
      "Total",
      metrics.latency.total,
    ],
  ] as const;

  return (
    <div className="latency-table">
      <div className="latency-row latency-head">
        <span>Stage</span>
        <span>Average</span>
        <span>P95</span>
      </div>

      {rows.map(
        ([name, metric]) => (
          <div
            key={name}
            className="latency-row"
          >
            <span>{name}</span>

            <span>
              {formatLatency(
                metric.avg
              )}
            </span>

            <span>
              {formatLatency(
                metric.p95
              )}
            </span>
          </div>
        )
      )}
    </div>
  );
}

function formatLatency(
  value: number | null
) {
  if (value === null) {
    return "-";
  }

  return `${value} ms`;
}

function formatPercent(
  value: number
) {
  return `${(
    value * 100
  ).toFixed(1)}%`;
}

