
import { readFile } from "node:fs/promises";
import path from "node:path";

interface EvaluationReport {
  schemaVersion: number;
  runId: string;
  createdAt: string;
  datasetVersion: string;
  metrics: Record<string, number | null>;
  cases: Array<Record<string, unknown>>;
}

type MetricRule = {
  label: string;
  maxRegression: number;
};

// 允许的最大绝对退化幅度。
// 所有指标均使用原始评估报告中的数值尺度。
const METRIC_RULES: Record<string, MetricRule> = {
  retrievalHitRateAt5: {
    label: "Hit Rate@5",
    maxRegression: 0.03,
  },
  retrievalRecallAt5: {
    label: "Recall@5",
    maxRegression: 0.03,
  },
  retrievalPrecisionAt5: {
    label: "Precision@5",
    maxRegression: 0.03,
  },
  mrr: {
    label: "MRR",
    maxRegression: 0.03,
  },
  answerCorrectness: {
    label: "Answer Correctness",
    maxRegression: 0.2,
  },
  answerRelevance: {
    label: "Answer Relevance",
    maxRegression: 0.2,
  },
  answerFaithfulness: {
    label: "Answer Faithfulness",
    maxRegression: 0.03,
  },
  citationValidity: {
    label: "Citation Validity",
    maxRegression: 0.01,
  },
};

type CheckStatus = "PASS" | "FAIL" | "SKIP";

interface MetricCheck {
  key: string;
  label: string;
  status: CheckStatus;
  baseline: number | null;
  current: number | null;
  delta: number | null;
  allowedRegression: number;
  message: string;
}

async function loadReport(filePath: string): Promise<EvaluationReport> {
  const content = await readFile(filePath, "utf8");
  const parsed: unknown = JSON.parse(content);

  if (!parsed || typeof parsed !== "object") {
    throw new Error(`Invalid report: ${filePath}`);
  }

  const report = parsed as Partial<EvaluationReport>;

  if (
    report.schemaVersion !== 1 ||
    typeof report.runId !== "string" ||
    typeof report.datasetVersion !== "string" ||
    !report.metrics ||
    typeof report.metrics !== "object" ||
    Array.isArray(report.metrics) ||
    !Array.isArray(report.cases)
  ) {
    throw new Error(`Report schema validation failed: ${filePath}`);
  }

  return report as EvaluationReport;
}

function checkMetric(
  baseline: EvaluationReport,
  current: EvaluationReport,
  key: string,
  rule: MetricRule,
): MetricCheck {
  const baselineValue = baseline.metrics[key];
  const currentValue = current.metrics[key];

  const validBaseline =
    typeof baselineValue === "number" &&
    Number.isFinite(baselineValue);

  const validCurrent =
    typeof currentValue === "number" &&
    Number.isFinite(currentValue);

  if (!validBaseline || !validCurrent) {
    return {
      key,
      label: rule.label,
      status: "SKIP",
      baseline: validBaseline ? baselineValue : null,
      current: validCurrent ? currentValue : null,
      delta: null,
      allowedRegression: rule.maxRegression,
      message: "指标缺失或不是有效数字",
    };
  }

  const delta = currentValue - baselineValue;
  const regressedBy = baselineValue - currentValue;

  if (regressedBy > rule.maxRegression + 1e-12) {
    return {
      key,
      label: rule.label,
      status: "FAIL",
      baseline: baselineValue,
      current: currentValue,
      delta,
      allowedRegression: rule.maxRegression,
      message: `退化 ${regressedBy.toFixed(3)}，超过允许值`,
    };
  }

  return {
    key,
    label: rule.label,
    status: "PASS",
    baseline: baselineValue,
    current: currentValue,
    delta,
    allowedRegression: rule.maxRegression,
    message:
      delta < 0
        ? `轻微退化，在允许范围内`
        : delta > 0
          ? "指标改善"
          : "指标持平",
  };
}

function printChecks(checks: MetricCheck[]): void {
  console.log("\n=== Regression Gate Results ===\n");

  console.table(
    checks.map((check) => ({
      Metric: check.label,
      Status: check.status,
      Baseline: check.baseline?.toFixed(3) ?? "N/A",
      Current: check.current?.toFixed(3) ?? "N/A",
      Delta: check.delta?.toFixed(3) ?? "N/A",
      AllowedRegression: check.allowedRegression.toFixed(3),
      Result: check.message,
    })),
  );

  const passed = checks.filter((item) => item.status === "PASS").length;
  const failed = checks.filter((item) => item.status === "FAIL").length;
  const skipped = checks.filter((item) => item.status === "SKIP").length;

  console.log(`PASS: ${passed}`);
  console.log(`FAIL: ${failed}`);
  console.log(`SKIP: ${skipped}`);
}

export interface FusionGateConfig {
  minRecallDelta: number;
  minCitationPrecisionDelta: number;
  maxP95LatencyIncreaseRatio: number;
  maxTokenIncreaseRatio: number;
}

export interface FusionGateInput {
  baselineRecallAtK: number;
  fusionRecallAtK: number;
  baselineCitationPrecision: number;
  fusionCitationPrecision: number;
  baselineP95Ms: number;
  fusionP95Ms: number;
  baselineTokens: number;
  fusionTokens: number;
}

export interface FusionGateResult {
  passed: boolean;
  checks: {
    name: string;
    passed: boolean;
    actual: number;
    threshold: number;
  }[];
}

export function evaluateFusionGate(
  input: FusionGateInput,
  config: FusionGateConfig,
): FusionGateResult {
  const checks = [
    {
      name: "Recall@K delta",
      actual: input.fusionRecallAtK - input.baselineRecallAtK,
      threshold: config.minRecallDelta,
    },
    {
      name: "Citation precision delta",
      actual:
        input.fusionCitationPrecision -
        input.baselineCitationPrecision,
      threshold: config.minCitationPrecisionDelta,
    },
    {
      name: "P95 latency increase ratio",
      actual:
        input.baselineP95Ms > 0
          ? (input.fusionP95Ms - input.baselineP95Ms) /
            input.baselineP95Ms
          : input.fusionP95Ms > 0
            ? Infinity
            : 0,
      threshold: config.maxP95LatencyIncreaseRatio,
    },
    {
      name: "Token increase ratio",
      actual:
        input.baselineTokens > 0
          ? (input.fusionTokens - input.baselineTokens) /
            input.baselineTokens
          : input.fusionTokens > 0
            ? Infinity
            : 0,
      threshold: config.maxTokenIncreaseRatio,
    },
  ];

  const resultChecks = checks.map((check, index) => ({
    ...check,
    passed:
      index < 2
        ? check.actual >= check.threshold
        : check.actual <= check.threshold,
  }));

  return {
    passed: resultChecks.every((check) => check.passed),
    checks: resultChecks,
  };
}

async function main(): Promise<void> {
  const [baselineArg, currentArg] = process.argv.slice(2);

  if (!baselineArg || !currentArg) {
    throw new Error(
      "Usage: npx tsx evaluation/regression-gate.ts " +
        "<baseline.json> <current.json>",
    );
  }

  const baselinePath = path.resolve(baselineArg);
  const currentPath = path.resolve(currentArg);

  const baseline = await loadReport(baselinePath);
  const current = await loadReport(currentPath);

  console.log(`Baseline: ${baseline.runId}`);
  console.log(`Current:  ${current.runId}`);
  console.log(`Dataset:  ${current.datasetVersion}`);

  // 严格门禁：数据集版本未知或不一致时，不作正式判定。
  if (
    !baseline.datasetVersion ||
    !current.datasetVersion ||
    baseline.datasetVersion === "unknown" ||
    current.datasetVersion === "unknown" ||
    baseline.datasetVersion !== current.datasetVersion
  ) {
    console.error(
      "\nGATE BLOCKED: 数据集版本未知或不一致，无法进行有效的基线比较。",
    );
    process.exitCode = 2;
    return;
  }

  const checks = Object.entries(METRIC_RULES).map(([key, rule]) =>
    checkMetric(baseline, current, key, rule),
  );

  printChecks(checks);

  const failed = checks.some((item) => item.status === "FAIL");
  const skipped = checks.some((item) => item.status === "SKIP");

  if (failed || skipped) {
    console.error(
      "\nGATE FAILED: 存在超阈值退化或无法比较的指标。",
    );
    process.exitCode = 1;
    return;
  }

  console.log("\nGATE PASSED: 所有配置指标均在允许范围内。");
}

main().catch((error: unknown) => {
  console.error("Regression gate error:", error);
  process.exitCode = 1;
});

