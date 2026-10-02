import {
    resetRagMetrics,
  } from "@/lib/metrics";
  import { authenticateRequest } from "@/lib/auth";

  export async function POST(request: Request) {

    resetRagMetrics();
  
    return Response.json({
      success: true,
    });
  }