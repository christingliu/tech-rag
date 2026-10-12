import path from "node:path";
import { compareEvaluationReports } from "./report";

const [baselineArg, currentArg] = process.argv.slice(2);

if (!baselineArg || !currentArg) {
  throw new Error(
    "Usage: tsx evaluation/compare.ts <baseline.json> <current.json>",
  );
}

await compareEvaluationReports(
  path.resolve(baselineArg),
  path.resolve(currentArg),
);