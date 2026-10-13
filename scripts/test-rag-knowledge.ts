import "./env";

import {
  getDemoGraph,
  retrieveKnowledgeEvidence,
} from "../lib/rag-knowledge";

import {
    retrieve,
  } from "../lib/rag";

async function main() {
 const demoGraph = await getDemoGraph();
 
 console.log(demoGraph,'demoGraph');

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