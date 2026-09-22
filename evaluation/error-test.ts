import "../scripts/env";
import {
    answerQuestion,
  } from "../lib/rag";
  
  import {
    RagError,
  } from "../lib/error";
  
  import {
    setRagTestFailures,
    clearRagTestFailures,
  } from "../lib/rag-test";
  
  interface TestCase {
    name: string;
  
    failures: {
      rewrite?: boolean;
      vector?: boolean;
      keyword?: boolean;
      hybrid?: boolean;
      rerank?: boolean;
      llm?: boolean;
    };
  
    expected: "success" | "error";
  
    validate?: (
      result: any
    ) => boolean;
  }
  
  const TEST_QUESTION =
    "React 中 useState 更新状态后会发生什么？";
  
  const tests: TestCase[] = [
      /*  {
      name:
        "Query Rewrite failure → fallback to original query",
  
      failures: {
        rewrite: true,
      },
  
      expected: "success",
  
      validate(result) {
        return (
          result.debug
            .queryRewriteFallback === true
        );
      },
    },
  
 {
      name:
        "Vector Search failure → fallback to Keyword Search",
  
      failures: {
        vector: true,
      },
  
      expected: "success",
  
      validate(result) {
        return (
          result.debug
            .vectorSearchFailed === true &&
          result.debug
            .keywordSearchFailed === false
        );
      },
    },
  
    {
      name:
        "Keyword Search failure → fallback to Vector Search",
  
      failures: {
        keyword: true,
      },
  
      expected: "success",
  
      validate(result) {
        return (
          result.debug
            .keywordSearchFailed === true &&
          result.debug
            .vectorSearchFailed === false
        );
      },
    },
  
    {
      name:
        "Vector + Keyword failure → fail fast",
  
      failures: {
        vector: true,
        keyword: true,
      },
  
      expected: "error",
    },
  
    {
      name:
        "Hybrid failure → fail fast",
  
      failures: {
        hybrid: true,
      },
  
      expected: "error",
    },
  
    {
      name:
        "Rerank failure → fallback to Hybrid",
  
      failures: {
        rerank: true,
      },
  
      expected: "success",
  
      validate(result) {
        return (
          result.debug
            .rerankFallback === true
        );
      },
    },
  */
    {
      name:
        "LLM failure → fail fast",
  
      failures: {
        llm: true,
      },
  
      expected: "error",
    }, 
  ];
  
  async function runTest(
    test: TestCase
  ) {
    console.log(
      "\n========================================"
    );
  
    console.log(
      `TEST: ${test.name}`
    );
  
    console.log(
      "========================================"
    );
  
    clearRagTestFailures();
  
    setRagTestFailures(
      test.failures
    );
  
    try {
      const result =
        await answerQuestion(
          TEST_QUESTION
        );
  
      if (
        test.expected === "error"
      ) {
        console.error(
          "❌ FAIL"
        );
  
        console.error(
          "Expected an error, but request succeeded."
        );
  
        return false;
      }
  
      if (
        test.validate &&
        !test.validate(result)
      ) {
        console.error(
          "❌ FAIL"
        );
  
        console.error(
          "Request succeeded, but fallback behavior was incorrect."
        );
  
        console.error(
          "Debug:",
          result.debug
        );
  
        return false;
      }
  
      console.log(
        "✅ PASS"
      );
  
      console.log(
        "Debug:",
        result.debug
      );
  
      return true;
    } catch (error) {
      if (
        test.expected !== "error"
      ) {
        console.error(
          "❌ FAIL"
        );
  
        console.error(
          "Unexpected error:",
          error
        );
  
        return false;
      }
  
      if (
        error instanceof RagError
      ) {
        console.log(
          "Received RagError:"
        );
  
        console.log(
          "Stage:",
          error.stage
        );
  
        console.log(
          "Message:",
          error.message
        );
  
        console.log(
          "✅ PASS"
        );
  
        return true;
      }
  
      console.error(
        "❌ FAIL"
      );
  
      console.error(
        "Expected RagError, received:",
        error
      );
  
      return false;
    } finally {
      clearRagTestFailures();
    }
  }
  
  async function main() {
    console.log(
      "\n========================================"
    );
  
    console.log(
      "V4.1 Error Handling Tests"
    );
  
    console.log(
      "========================================"
    );
  
    let passed = 0;
  
    for (const test of tests) {
      const success =
        await runTest(test);
  
      if (success) {
        passed++;
      }
    }
  
    console.log(
      "\n========================================"
    );
  
    console.log(
      `Result: ${passed}/${tests.length} passed`
    );
  
    console.log(
      "========================================"
    );
  
    if (
      passed !== tests.length
    ) {
      process.exit(1);
    }
  }
  
  main().catch((error) => {
    console.error(
      "\nError test runner failed:"
    );
  
    console.error(error);
  
    process.exit(1);
  });