
import type {
    QueryTaskExecutionResult,
    TaskRetrievalResult,
  } from "./query-task-executor";
  
  export interface AggregatedEvidence {
    id: string;
    data: unknown;
    taskIds: string[];
    tools: Array<"vector_search" | "keyword_search">;
    occurrences: number;
  }
  
  export interface TaskCoverage {
    taskId: string;
    question: string;
    status: "covered" | "no_evidence" | "failed";
    evidenceCount: number;
  }
  
  export interface EvidenceAggregationResult {
    originalQuestion: string;
    evidence: AggregatedEvidence[];
    coverage: TaskCoverage[];
    coveredTaskCount: number;
    totalTaskCount: number;
    coverageRatio: number;
    missingTaskIds: string[];
    failedTaskIds: string[];
    canAnswer: boolean;
  }
  
  function asRecord(value: unknown): Record<string, unknown> | null {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }
  
    return value as Record<string, unknown>;
  }
  
  function normalizeText(value: string): string {
    return value.trim().replace(/\s+/g, " ").toLowerCase();
  }
  
  /**
   * 提取常见检索结果中的文档或 chunk。
   * 不认识的数据结构按单条证据保留，不擅自丢弃。
   */
  function flattenEvidence(data: unknown): unknown[] {
    if (Array.isArray(data)) {
      return data.flatMap(flattenEvidence);
    }
  
    const record = asRecord(data);
  
    if (record) {
      if (Array.isArray(record.chunks)) {
        return record.chunks.flatMap(flattenEvidence);
      }
  
      if (Array.isArray(record.evidence)) {
        return record.evidence.flatMap(flattenEvidence);
      }
    }
  
    return data == null ? [] : [data];
  }
  
  /**
   * 优先使用稳定的 chunk/document ID；
   * 没有 ID 时使用文本内容，最后才使用序列化内容。
   */
  
function getEvidenceKey(data: unknown): string {
    const record = asRecord(data);
    if (record) {
      const content =
        record.pageContent ??
        record.page_content ??
        record.content ??
        record.text;
  
      if (typeof content === "string" && content.trim()) {
        return `text:${normalizeText(content)}`;
      }
  
      const metadata = asRecord(record.metadata);
  
      const explicitId =
        record.chunkId ??
        record.chunk_id ??
        record.id ??
        record.documentId ??
        record.document_id ??
        metadata?.chunkId ??
        metadata?.chunk_id;
  
      if (
        typeof explicitId === "string" ||
        typeof explicitId === "number"
      ) {
        return `id:${String(explicitId)}`;
      }
    }
  
    if (typeof data === "string") {
      return `text:${normalizeText(data)}`;
    }
  
    try {
      return `json:${JSON.stringify(data)}`;
    } catch {
      return `object:${String(data)}`;
    }
  }
  
  
  export function aggregateEvidence(
    result: QueryTaskExecutionResult,
  ): EvidenceAggregationResult {
    const evidenceByKey = new Map<string, AggregatedEvidence>();
    const coverage: TaskCoverage[] = [];//全部任务
  
    for (const task of result.tasks) {
      let taskEvidenceCount = 0;
  
      for (const item of task.evidence) {
        const flattened = flattenEvidence(item.data);
         console.log(flattened,'flattened');
        for (const data of flattened) {
          const key = getEvidenceKey(data);
          let existing = evidenceByKey.get(key);
          /* console.log(key,'key');
          console.log(existing,'existing'); */
          if (!existing) {
            existing = {
              id: `evidence-${evidenceByKey.size + 1}`,
              data,
              taskIds: [],
              tools: [],
              occurrences: 0,
            };
  
            evidenceByKey.set(key, existing);
          }
  
          existing.occurrences += 1;
  
          if (!existing.taskIds.includes(item.taskId)) {
            existing.taskIds.push(item.taskId);
          }
  
          if (!existing.tools.includes(item.tool)) {
            existing.tools.push(item.tool);
          }
  
          taskEvidenceCount += 1;
        }
      }
  
      // 实际 evidence 优先于工具返回的状态，
      // 避免仅因状态字段不一致而漏掉已有证据。
      const status: TaskCoverage["status"] =
        taskEvidenceCount > 0
          ? "covered"
          : task.status === "failed"
            ? "failed"
            : "no_evidence";
  
      coverage.push({
        taskId: task.taskId,
        question: task.question,
        status,
        evidenceCount: taskEvidenceCount,
      });
    }
    //有证据的子任务的数量
    const coveredTaskCount = coverage.filter(
      (task) => task.status === "covered",
    ).length;
     //检索正常但没有找到证据的任务
    const missingTaskIds = coverage
      .filter((task) => task.status === "no_evidence")
      .map((task) => task.taskId);
    //检索执行失败任务 Id数组
    const failedTaskIds = coverage
      .filter((task) => task.status === "failed")
      .map((task) => task.taskId);
  
    const totalTaskCount = coverage.length;
    //有证据的子任务占全部子任务的比例
    const coverageRatio =
      totalTaskCount === 0 ? 0 : coveredTaskCount / totalTaskCount;
  
    return {
      originalQuestion: result.originalQuestion,
      evidence: [...evidenceByKey.values()],
      coverage,
      coveredTaskCount,
      totalTaskCount,
      coverageRatio,
      missingTaskIds,
      failedTaskIds,
  
      // 这是任务覆盖率门槛，不是语义正确性的证明。
      canAnswer:
        totalTaskCount > 0 &&
        missingTaskIds.length === 0 &&
        failedTaskIds.length === 0,
    };
  }
  