import {
    getRagMetrics,
  } from "@/lib/metrics";
  
  export async function GET() {
    return Response.json(
      getRagMetrics()
    );
  }