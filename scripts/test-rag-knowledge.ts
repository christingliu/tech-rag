import "./env";

import {
  getDemoGraph,
  retrieveKnowledgeEvidence,
} from "../lib/rag-knowledge";

import {
    retrieve,
  } from "../lib/rag";

import { createHash } from "node:crypto";

async function main() {
 const demoGraph = await getDemoGraph();
 
 console.log(demoGraph,'demoGraph');

 console.log("\n========== Evidence Mapping ==========");

console.dir(
  demoGraph.evidence.map((item) => ({
    id: item.id,
    key: JSON.stringify([
      item.source,
      item.title,
      item.section,
      item.chunkIndex,
    ]),
  })),
  { depth: null },
);

const queries = [
  "React useState 状态管理",
  "React useEffect 副作用 外部系统同步",
];

for (const query of queries) {
  console.log(`\n========== Query: ${query} ==========`);

  const chunks = await retrieve(query, 10, -1);

  console.dir(
    chunks.map((chunk) => ({
      id: `evidence-${createHash("sha256")
        .update(
          JSON.stringify([
            chunk.source.trim(),
            chunk.title.trim(),
            chunk.section.trim(),
            chunk.chunkIndex,
          ]),
        )
        .digest("hex")
        .slice(0, 16)}`,
      source: chunk.source,
      title: chunk.title,
      section: chunk.section,
      chunkIndex: chunk.chunkIndex,
      content: chunk.content,
    })),
    { depth: null },
  );
}

console.log("\n========== Retrieved Chunks ==========");

  const chunks = await retrieve(
    "React useState 状态管理",
    10,
    -1,
  );

  console.dir(
    chunks.map((chunk) => ({
      source: chunk.source,
      title: chunk.title,
      section: chunk.section,
      chunkIndex: chunk.chunkIndex,
      content: chunk.content,
    })),
    { depth: null },
  );

 const result = await retrieveKnowledgeEvidence(
    demoGraph,
    "React useState 状态",
    1,
  );

  console.log("\nMatched Nodes:");
  console.dir(result.matchedNodes, { depth: null });

  console.log("\nGraph Edges:");
  console.dir(result.edges, { depth: null });

  console.log("\nRetrieved Real Chunks:");
  console.dir(
    result.chunks.map((chunk) => ({
      source: chunk.source,
      title: chunk.title,
      section: chunk.section,
      chunkIndex: chunk.chunkIndex,
      content: chunk.content,
    })),
    { depth: null },
  );

  console.log("\nUnresolved Evidence:");
  console.dir(result.unresolvedEvidence, {
    depth: null,
  });

  console.log("\nSummary:");
  console.log({
    matchedNodes: result.matchedNodes.length,
    edges: result.edges.length,
    evidence: result.evidence.length,
    retrievedChunks: result.chunks.length,
    unresolvedEvidence: result.unresolvedEvidence.length,
  }); 
/*   const results = await retrieve(
    "React useState 状态",
    10,
    -1,
  );
  
  console.log("\n========== Actual Qdrant Metadata ==========");
  
  console.dir(
    results.map((item) => ({
      source: item.source,
      title: item.title,
      section: item.section,
      chunkIndex: item.chunkIndex,
      content: item.content,
    })),
    { depth: null },
  ); */
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});