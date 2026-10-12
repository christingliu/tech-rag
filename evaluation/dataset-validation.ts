
import dataset from "./dataset.json";

export interface EvaluationCase {
  id: string;
  question: string;
  referenceAnswer: string;
  expectedSources: string[];
}

export const REGRESSION_DATASET_VERSION = "regression-v1";

const EXPECTED_CASE_COUNT = 20;

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

export function validateDataset(
  data: unknown = dataset,
): asserts data is EvaluationCase[] {
  const errors: string[] = [];

  if (!Array.isArray(data)) {
    throw new Error("Evaluation dataset must be an array.");
  }

  if (data.length !== EXPECTED_CASE_COUNT) {
    errors.push(
      `Expected ${EXPECTED_CASE_COUNT} cases, got ${data.length}.`,
    );
  }

  const ids = new Set<string>();

  data.forEach((item: unknown, index: number) => {
    const prefix = `Case at index ${index}`;

    if (!isRecord(item)) {
      errors.push(`${prefix} must be an object.`);
      return;
    }

    const { id, question, referenceAnswer, expectedSources } = item;

    if (typeof id !== "string" || !/^q\d{3}$/.test(id)) {
      errors.push(`${prefix}: id must match q001 format.`);
    } else {
      if (ids.has(id)) {
        errors.push(`${prefix}: duplicate id "${id}".`);
      }
      ids.add(id);
    }

    if (typeof question !== "string" || !question.trim()) {
      errors.push(`${prefix}: question must be non-empty.`);
    }

    if (
      typeof referenceAnswer !== "string" ||
      !referenceAnswer.trim()
    ) {
      errors.push(`${prefix}: referenceAnswer must be non-empty.`);
    }

    if (
      !Array.isArray(expectedSources) ||
      !expectedSources.every(
        (source: unknown) =>
          typeof source === "string" && source.trim().length > 0,
      )
    ) {
      errors.push(
        `${prefix}: expectedSources must be an array of non-empty strings.`,
      );
    } else if (new Set(expectedSources).size !== expectedSources.length) {
      errors.push(`${prefix}: expectedSources contains duplicates.`);
    }
  });

  if (errors.length > 0) {
    throw new Error(
      `Invalid evaluation dataset:\n- ${errors.join("\n- ")}`,
    );
  }
}

export function getRegressionDataset(): EvaluationCase[] {
  validateDataset();
  return dataset as EvaluationCase[];
}