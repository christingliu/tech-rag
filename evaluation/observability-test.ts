import {
    getRagMetrics,
    resetRagMetrics,
    recordRagTrace,
  } from "../lib/metrics";
  import type { RagTrace } from "../lib/trace";
  
  function createTrace(
    overrides: Partial<RagTrace> = {}
  ): RagTrace {
    return {
      requestId: "test-request",
      query: "test query",
      startedAt: Date.now(),
      status: "success",
      totalLatencyMs: 100,
  
      ...overrides,
    };
  }
  
  function assert(
    condition: boolean,
    message: string
  ) {
    if (!condition) {
      throw new Error(`❌ ${message}`);
    }
  }
  
  function assertEqual<T>(
    actual: T,
    expected: T,
    message: string
  ) {
    if (actual !== expected) {
      throw new Error(
        `❌ ${message}\n` +
          `Expected: ${expected}\n` +
          `Actual: ${actual}`
      );
    }
  }
  
  function testSuccess() {
    resetRagMetrics();
  
    recordRagTrace(
      createTrace({
        status: "success",
      })
    );
  
    const metrics = getRagMetrics();
  
    assertEqual(
      metrics.requests,
      1,
      "Success request 应该统计为 1 次"
    );
  
    assertEqual(
      metrics.successes,
      1,
      "Success 应该统计为 1 次"
    );
  
    assertEqual(
      metrics.errors,
      0,
      "Success 测试不应该产生 Error"
    );
  
    console.log("✅ Success test passed");
  }
  
  function testError() {
    resetRagMetrics();
  
    recordRagTrace(
      createTrace({
        status: "error",
        error: {
          stage: "llm",
          message: "LLM failed",
        },
      })
    );
  
    const metrics = getRagMetrics();
  
    assertEqual(
      metrics.requests,
      1,
      "Error request 应该统计为 1 次"
    );
  
    assertEqual(
      metrics.successes,
      0,
      "Error 不应该统计为 Success"
    );
  
    assertEqual(
      metrics.errors,
      1,
      "Error 应该统计为 1 次"
    );
  
    assertEqual(
      metrics.errorRate,
      1,
      "Error Rate 应该是 100%"
    );
  
    console.log("✅ Error test passed");
  }
  
  function testCacheHit() {
    resetRagMetrics();
  
    recordRagTrace(
      createTrace({
        status: "success",
        cache: {
          hit: true,
        },
      })
    );
  
    const metrics = getRagMetrics();
  
    assertEqual(
      metrics.requests,
      1,
      "Cache Hit request 应该统计为 1 次"
    );
  
    assertEqual(
      metrics.cacheHits,
      1,
      "Cache Hit 应该统计为 1 次"
    );
  
    assertEqual(
      metrics.cacheMisses,
      0,
      "Cache Hit 不应该增加 Cache Miss"
    );
  
    assertEqual(
      metrics.cacheHitRate,
      1,
      "Cache Hit Rate 应该是 100%"
    );
  
    console.log("✅ Cache Hit test passed");
  }
  
  function testAverageLatency() {
    resetRagMetrics();
  
    recordRagTrace(
      createTrace({
        totalLatencyMs: 100,
      })
    );
  
    recordRagTrace(
      createTrace({
        totalLatencyMs: 200,
      })
    );
  
    recordRagTrace(
      createTrace({
        totalLatencyMs: 300,
      })
    );
  
    const metrics = getRagMetrics();
  
    assertEqual(
      metrics.latency.total.avg,
      200,
      "平均 Total Latency 应该是 200ms"
    );
  
    console.log(
      "✅ Average latency test passed"
    );
  }
  
  function testStageLatency() {
    resetRagMetrics();
  
    recordRagTrace(
      createTrace({
        embedding: {
          model: "text-embedding-3-small",
          latencyMs: 100,
        },
  
        retrieval: {
          topK: 10,
          candidateCount: 10,
          latencyMs: 200,
        },
  
        keywordRetrieval: {
          candidateCount: 10,
          latencyMs: 50,
        },
  
        rerank: {
          model: "gpt-4o-mini",
          before: 10,
          after: 3,
          latencyMs: 300,
        },
  
        llm: {
          model: "gpt-4o-mini",
          latencyMs: 500,
        },
  
        totalLatencyMs: 1200,
      })
    );
  
    const metrics = getRagMetrics();
  
    assertEqual(
      metrics.latency.retrieval.avg,
      200,
      "Retrieval 平均延迟应该是 200ms"
    );
  
    assertEqual(
      metrics.latency.keywordRetrieval.avg,
      50,
      "Keyword Retrieval 平均延迟应该是 50ms"
    );
  
    assertEqual(
      metrics.latency.rerank.avg,
      300,
      "Rerank 平均延迟应该是 300ms"
    );
  
    assertEqual(
      metrics.latency.llm.avg,
      500,
      "LLM 平均延迟应该是 500ms"
    );
  
    assertEqual(
      metrics.latency.total.avg,
      1200,
      "Total 平均延迟应该是 1200ms"
    );
  
    console.log(
      "✅ Stage latency test passed"
    );
  }
  
  function testMixedMetrics() {
    resetRagMetrics();
  
    // Success + Cache Hit
    recordRagTrace(
      createTrace({
        status: "success",
        cache: {
          hit: true,
        },
        totalLatencyMs: 50,
      })
    );
  
    // Success + Cache Miss
    recordRagTrace(
      createTrace({
        status: "success",
        cache: {
          hit: false,
        },
        totalLatencyMs: 200,
      })
    );
  
    // Error
    recordRagTrace(
      createTrace({
        status: "error",
        totalLatencyMs: 500,
      })
    );
  
    const metrics = getRagMetrics();
  
    assertEqual(
      metrics.requests,
      3,
      "总请求数应该是 3"
    );
  
    assertEqual(
      metrics.successes,
      2,
      "Success 应该是 2"
    );
  
    assertEqual(
      metrics.errors,
      1,
      "Error 应该是 1"
    );
  
    assertEqual(
      metrics.cacheHits,
      1,
      "Cache Hit 应该是 1"
    );
  
    assertEqual(
      metrics.cacheMisses,
      1,
      "Cache Miss 应该是 1"
    );
  
    assertEqual(
      metrics.errorRate,
      1 / 3,
      "Error Rate 应该是 1/3"
    );
  
    assertEqual(
      metrics.cacheHitRate,
      1 / 2,
      "Cache Hit Rate 应该是 1/2"
    );
  
    assertEqual(
      metrics.latency.total.avg,
      250,
      "平均 Total Latency 应该是 250ms"
    );
  
    console.log(
      "✅ Mixed metrics test passed"
    );
  }
  
  function run() {
    console.log(
      "\n=== V4.5.4 Metrics Test ===\n"
    );
  
    testSuccess();
    testError();
    testCacheHit();
    testAverageLatency();
    testStageLatency();
    testMixedMetrics();
  
    console.log(
      "\n🎉 All metrics tests passed\n"
    );
  }
  
  run();