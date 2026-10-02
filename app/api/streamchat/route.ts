import {
  createRequestId,
} from "@/lib/trace";

import {
  answerQuestionStream,
} from "@/lib/rag-stream";

import {
  RagError,
} from "@/lib/error";

import {
  validateCitations,
} from "@/lib/citation";

import { authenticateRequest } from "@/lib/auth";

function encodeSSE(
  event: string,
  data: unknown
) {
  return (
    `event: ${event}\n` +
    `data: ${JSON.stringify(data)}\n\n`
  );
}

export async function POST(
  request: Request
) {
  /* if (!authenticateRequest(request)) {
    return Response.json(
      {
        error: "Unauthorized",
      },
      {
        status: 401,
      }
    );
  } */
  const requestId = createRequestId();
  try {
    const body =
      await request.json();

    const question =
      body.question;

    if (
      typeof question !== "string" ||
      !question.trim()
    ) {
      return Response.json(
        {
          error:
            "Question is required",
        },
        {
          status: 400,
        }
      );
    }


    const result =
      await answerQuestionStream(
        question,
        body.filter,
        requestId
      );
    console.log(result,'result');
    
    if (!result.stream) {
      return Response.json({
        answer:
          "知识库中没有找到与该问题相关的信息。",
        sources: [],
        debug: result.debug,
        requestId:result.requestId
      });
    }

    const encoder =
      new TextEncoder();

    const stream =
      new ReadableStream({
        async start(controller) {
          try {
            let fullAnswer = "";

            for await (
              const chunk of result.stream
            ) {
              let content: string | undefined;
               console.log(chunk,'chunk');
              /*
               * Cache Hit 时 streamCachedAnswer yield 的是纯 string；
               * Cache Miss 时 llmStream yield 的是 OpenAI chunk。
               * 两种情况都要支持，否则 cache hit 不会发出任何 token。
               */
              if (typeof chunk === "string") {
                content = chunk;
              } else {
                const choices =
                  (
                    chunk as {
                      choices?: Array<{
                        delta?: {
                          content?: string;
                        };
                      }>;
                    }
                  ).choices ?? [];

                content =
                  choices[0]?.delta?.content;
              }

              if (!content) {
                continue;
              }

              fullAnswer += content;

              controller.enqueue(
                encoder.encode(
                  encodeSSE("token", {
                    content,
                  })
                )
              );
            }

            /*
             * Cache Hit 时后端已经算过 citationValidation，
             * 直接复用，避免用空 fullAnswer 重算得到 "missing"。
             */
            const citationValidation =
              result.citationValidation ??
              validateCitations(
                fullAnswer,
                result.sources
              );

            controller.enqueue(
              encoder.encode(
                encodeSSE("sources", {
                  sources:
                    result.sources,
                  requestId:
                    result.requestId
                })
              )
            );

            controller.enqueue(
              encoder.encode(
                encodeSSE(
                  "citation_validation",
                  citationValidation
                )
              )
            );

            controller.enqueue(
              encoder.encode(
                encodeSSE("done", {
                  cacheHit: result.cacheHit
                })
              )
            );

            controller.close();
          } catch (error) {
            console.error(
              "[API] Streaming failed:",
              error
            );

            controller.enqueue(
              encoder.encode(
                encodeSSE("error", {
                  error:
                    "Streaming failed",
                  requestId:
                    result?.requestId
                })
              )
            );

            controller.close();
          }
        },
      });

    return new Response(
      stream,
      {
        headers: {
          "Content-Type":
            "text/event-stream; charset=utf-8",

          "Cache-Control":
            "no-cache, no-transform",

          Connection:
            "keep-alive",

          "X-Accel-Buffering":
            "no",
        },
      }
    );
  } catch (error) {
    console.error(
      "[API] Chat failed:",
      error
    );

    if (error instanceof RagError) {
      return Response.json(
        {
          error:
            "RAG request failed",
          stage: error.stage,
        },
        {
          status: 500,
        }
      );
    }

    return Response.json(
      {
        error:
          "Internal server error",
      },
      {
        status: 500,
      }
    );
  }
}