import { NextResponse } from "next/server";
import { qdrant, COLLECTION_NAME } from "@/lib/qdrant";

export async function GET() {
  try {
    const { points } = await qdrant.scroll(COLLECTION_NAME, {
      limit: 1000,
      with_payload: true,
    });

    const titles = new Set<string>();
    const sources = new Set<string>();
    const sections = new Set<string>();

    for (const point of points) {
      const payload = point.payload as Record<string, unknown> | undefined;

      if (!payload) continue;

      if (typeof payload.title === "string") titles.add(payload.title);
      if (typeof payload.source === "string") sources.add(payload.source);
      if (typeof payload.section === "string") sections.add(payload.section);
    }

    return NextResponse.json({
      titles: [...titles].sort(),
      sources: [...sources].sort(),
      sections: [...sections].sort(),
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Failed to load filter options" },
      { status: 500 }
    );
  }
}
