export interface RagTestFailures {
    rewrite?: boolean;
    vector?: boolean;
    keyword?: boolean;
    hybrid?: boolean;
    rerank?: boolean;
    llm?: boolean;
  }
  
  let failures: RagTestFailures = {};
  
  export function setRagTestFailures(
    nextFailures: RagTestFailures
  ) {
    failures = nextFailures;
  }
  
  export function clearRagTestFailures() {
    failures = {};
  }
  
  export function shouldFail(
    stage: keyof RagTestFailures
  ) {
    return failures[stage] === true;
  }