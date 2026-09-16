import { NextRequest, NextResponse } from "next/server";
import { retrieve } from "@/lib/rag";

export async function POST(request: NextRequest) {
  const { query } = await request.json();

  const results = await retrieve(query);

  return NextResponse.json({
    query,
    results,
  });
}