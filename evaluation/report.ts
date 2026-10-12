
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface EvaluationReport {
  schemaVersion: 1;
  runId: string;
  createdAt: string;
  datasetVersion: string;
  baselineId?: string;
  metrics: Record<string, number | null>;
  cases: Record<string, unknown>[];
}

function flattenNumbers(
  value: unknown,
  prefix = "",
): Record<string, number> {
  const output: Record<string, number> = {};

  if (typeof value === "number" && Number.isFinite(value)) {
    if (prefix) output[prefix] = value;
    return output;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return output;
  }

  for (const [key, child] of Object.entries(value)) {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    Object.assign(output, flattenNumbers(child, nextPrefix));
  }

  return output;
}

export async function saveEvaluationReport(
  report: EvaluationReport,
): Promise<string> {
  const outputDir = path.join(process.cwd(), "evaluation", "runs");
  await mkdir(outputDir, { recursive: true });

  const filePath = path.join(outputDir, `${report.runId}.json`);

  await writeFile(
    filePath,
    JSON.stringify(report, null, 2) + "\n",
    "utf8",
  );

  return filePath;
}

export async function compareEvaluationReports(
  baselinePath: string,
  currentPath: string,
): Promise<void> {
  const baseline = JSON.parse(
    await readFile(baselinePath, "utf8"),
  ) as EvaluationReport;

  const current = JSON.parse(
    await readFile(currentPath, "utf8"),
  ) as EvaluationReport;

  console.log("\n=== Evaluation Baseline Comparison ===");
  console.log(`Baseline: ${baseline.runId}`);
  console.log(`Current:  ${current.runId}`);
  console.log(`Baseline dataset: ${baseline.datasetVersion}`);
  console.log(`Current dataset:  ${current.datasetVersion}`);

  if (baseline.datasetVersion !== current.datasetVersion) {
    console.warn(
      "WARNING: Dataset versions differ. Generation metrics may not be directly comparable.",
    );
  }

  console.log("\n--- Aggregate Metrics ---");
  console.log("Metric | Baseline | Current | Delta");

  const metricNames = new Set([
    ...Object.keys(baseline.metrics),
    ...Object.keys(current.metrics),
  ]);

  for (const name of [...metricNames].sort()) {
    const before = baseline.metrics[name];
    const after = current.metrics[name];

    if (
      typeof before !== "number" ||
      typeof after !== "number"
    ) {
      console.log(
        `${name} | ${before ?? "N/A"} | ${after ?? "N/A"} | N/A`,
      );
      continue;
    }

    const delta = after - before;

    console.log(
      `${name} | ${before.toFixed(3)} | ${after.toFixed(3)} | ${delta >= 0 ? "+" : ""}${delta.toFixed(3)}`,
    );
  }

  console.log("\n--- Per-Case Numeric Differences ---");

  const baselineCases = new Map(
    baseline.cases.map((item) => [String(item.id), item]),
  );

  const currentCases = new Map(
    current.cases.map((item) => [String(item.id), item]),
  );

  const allIds = new Set([
    ...baselineCases.keys(),
    ...currentCases.keys(),
  ]);

  for (const id of [...allIds].sort()) {
    const beforeCase = baselineCases.get(id);
    const afterCase = currentCases.get(id);

    if (!beforeCase) {
      console.log(`${id}: new case`);
      continue;
    }

    if (!afterCase) {
      console.log(`${id}: missing from current run`);
      continue;
    }

    const beforeValues = flattenNumbers(beforeCase);
    const afterValues = flattenNumbers(afterCase);
    const paths = new Set([
      ...Object.keys(beforeValues),
      ...Object.keys(afterValues),
    ]);

    const changes: string[] = [];

    for (const metric of [...paths].sort()) {
      const before = beforeValues[metric];
      const after = afterValues[metric];

      if (before === undefined || after === undefined) {
        continue;
      }

      if (Math.abs(after - before) > 1e-9) {
        changes.push(
          `${metric}: ${before} -> ${after} (delta ${(after - before).toFixed(3)})`,
        );
      }
    }

    if (changes.length > 0) {
      console.log(`${id}:`);
      for (const change of changes) {
        console.log(`  ${change}`);
      }
    }
  }
}