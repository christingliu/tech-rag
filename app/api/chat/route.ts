import { NextRequest, NextResponse } from "next/server";
import { answerQuestion, RetrieveFilter } from "@/lib/rag";

function sanitizeFilter(input: unknown): RetrieveFilter | undefined {
  if (typeof input !== "object" || input === null) {
    return undefined;
  }

  const filter: RetrieveFilter = {};

  for (const key of ["title", "source", "section"] as const) {
    const value = (input as Record<string, unknown>)[key];

    if (typeof value === "string" && value.trim()) {
      filter[key] = value.trim();
    }
  }

  return Object.keys(filter).length > 0 ? filter : undefined;
}

export async function POST(request: NextRequest) {
  try {
    const { question, filter } = await request.json();

    if (!question?.trim()) {
      return NextResponse.json(
        { error: "Question is required" },
        { status: 400 }
      );
    }
    console.log(filter,'filter');
    console.log(sanitizeFilter(filter),'sanitizeFilter(filter)');
    const result = await answerQuestion(question, sanitizeFilter(filter));

    return NextResponse.json(result);
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
