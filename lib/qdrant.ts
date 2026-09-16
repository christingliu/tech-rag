import { QdrantClient } from "@qdrant/js-client-rest";

const url = process.env.QDRANT_URL;

if (!url) {
  throw new Error("QDRANT_URL is not configured");
}

export const qdrant = new QdrantClient({
  url,
  apiKey: process.env.QDRANT_API_KEY || undefined,
});

export const COLLECTION_NAME = "tech_knowledge";

// 确保集合存在
export async function ensureCollection() {
  const collections = await qdrant.getCollections();

  console.log(collections,'collections');
  const exists = collections.collections.some(
    (collection) => collection.name === COLLECTION_NAME
  );

  if (!exists) {
    await qdrant.createCollection(COLLECTION_NAME, {
      vectors: {
        size: 1536,
        distance: "Cosine",
      },
    });
  }
}