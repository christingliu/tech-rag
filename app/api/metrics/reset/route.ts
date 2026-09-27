import {
    resetRagMetrics,
  } from "@/lib/metrics";
  
  export async function POST() {
    resetRagMetrics();
  
    return Response.json({
      success: true,
    });
  }