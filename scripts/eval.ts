import "./env";
import fs from "fs/promises";
import path from "path";
import { retrieve } from "../lib/rag";
import { generateAnswer } from "../lib/llm";

type EvalCase = {
  question: string;
  /** 期望命中的文档（ingest 时存入 payload 的 source 字段） */
  expectedSources: string[];
  /** 可选：期望命中的小节（payload 的 section 字段），用于评估 metadata 粒度 */
  expectedSections?: string[];
  /** 答案阶段：LLM 回答里应出现的关键词 */
  answerKeywords: string[];
};

type EvalRow = {
  question: string;
  expected: string;
  retrieved: number;
  hits: number;
  recall: number;
  precision: number;
  mrr: number;
  section: string;
  keyword: string;
};

function parseArgs() {
  const args = process.argv.slice(2);

  const getValue = (name: string) => {
    const index = args.indexOf(`--${name}`);
    return index >= 0 ? args[index + 1] : undefined;
  };

  return {
    limit: Number(getValue("limit") ?? 5),
    threshold: Number(getValue("threshold") ?? 0.3),
    withAnswer: args.includes("--with-answer"),
  };
}

async function loadEvalData(): Promise<EvalCase[]> {
  const filePath = path.join(process.cwd(), "scripts", "eval-data.json");
  const raw = await fs.readFile(filePath, "utf-8");
  return JSON.parse(raw) as EvalCase[];
}

function buildContext(results: Awaited<ReturnType<typeof retrieve>>) {
  return results
    .map((item, index) => {
      return `
[Source ${index + 1}]
Source: ${item.source}
Title: ${item.title}
Section: ${item.section}

${item.content}
`;
    })
    .join("\n\n");
}

function truncate(text: string, max = 22) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

async function main() {
  const { limit, threshold, withAnswer } = parseArgs();
  const cases = await loadEvalData();

  console.log("========== RAG 评估 ==========");
  console.log(
    `limit=${limit}  threshold=${threshold}  withAnswer=${withAnswer}  cases=${cases.length}`
  );
  console.log("");

  const rows: EvalRow[] = [];
  const lowScoreAnswers: { question: string; preview: string }[] = [];

  let recallSum = 0;
  let precisionSum = 0;
  let mrrSum = 0;
  let keywordSum = 0;

  for (const evalCase of cases) {
    // 评估阶段关闭 debug 日志，避免刷屏
    const results = await retrieve(evalCase.question, limit, threshold);

    const expectedSources = [...new Set(evalCase.expectedSources)];
    const expectedSections = evalCase.expectedSections ?? [];
    const retrievedSources = [...new Set(results.map((item) => item.source))];

    const sourceHits = expectedSources.filter((source) =>
      retrievedSources.includes(source)
    );

    const relevantCount = results.filter((item) =>
      expectedSources.includes(item.source)
    ).length;

    // Recall：期望命中的文档里，实际召回了多少
    const recall = sourceHits.length / expectedSources.length;

    // Precision：返回的结果里，有多少来自期望文档
    const precision =
      results.length > 0 ? relevantCount / results.length : 0;

    // MRR：第一个相关结果排在第几名（1/排名）
    const firstHitIndex = results.findIndex((item) =>
      expectedSources.includes(item.source)
    );
    const mrr = firstHitIndex >= 0 ? 1 / (firstHitIndex + 1) : 0;

    const sectionHit =
      expectedSections.length === 0
        ? "-"
        : expectedSections.some((section) =>
            results.some((item) => item.section === section)
          )
          ? "Y"
          : "N";

    let keywordRate = "-";
    if (withAnswer) {
      const context = buildContext(results);
      const { answer } = await generateAnswer(evalCase.question, context);

      const rate =
        evalCase.answerKeywords.length > 0
          ? evalCase.answerKeywords.filter((keyword) =>
              answer.includes(keyword)
            ).length / evalCase.answerKeywords.length
          : 1;

      keywordRate = rate.toFixed(2);
      keywordSum += rate;

      if (rate < 1) {
        lowScoreAnswers.push({
          question: evalCase.question,
          preview: answer.replace(/\s+/g, " ").slice(0, 100),
        });
      }
    }

    recallSum += recall;
    precisionSum += precision;
    mrrSum += mrr;

    rows.push({
      question: truncate(evalCase.question),
      expected: expectedSources.join(","),
      retrieved: results.length,
      hits: sourceHits.length,
      recall: Number(recall.toFixed(2)),
      precision: Number(precision.toFixed(2)),
      mrr: Number(mrr.toFixed(2)),
      section: sectionHit,
      keyword: keywordRate,
    });
  }

  console.table(rows);

  if (lowScoreAnswers.length > 0) {
    console.log("关键词未全部命中的回答预览：");
    for (const item of lowScoreAnswers) {
      console.log(`  [${item.question}]`);
      console.log(`    ${item.preview}`);
    }
  }

  const count = cases.length;

  console.log("\n========== 汇总 ==========");
  console.log(`Recall@${limit}      平均: ${(recallSum / count).toFixed(3)}`);
  console.log(`Precision@${limit}   平均: ${(precisionSum / count).toFixed(3)}`);
  console.log(`MRR           平均: ${(mrrSum / count).toFixed(3)}`);

  if (withAnswer) {
    console.log(`关键词命中率    平均: ${(keywordSum / count).toFixed(3)}`);
  }

  console.log("\n换组参数对比：");
  console.log("  npm run eval -- --limit 10 --threshold 0.2");
  console.log("  npm run eval -- --limit 3 --threshold 0.5 --with-answer");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
