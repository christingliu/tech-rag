export function authenticateRequest(
    request: Request
  ): boolean {
    const expectedApiKey =
      process.env.RAG_API_KEY;
  
    if (!expectedApiKey) {
      throw new Error(
        "RAG_API_KEY is not configured"
      );
    }
  
    const authorization =
      request.headers.get("authorization");
  
    if (!authorization) {
      return false;
    }
  
    const [scheme, token] =
      authorization.split(" ");
  
    if (
      scheme !== "Bearer" ||
      !token
    ) {
      return false;
    }
  
    return token === expectedApiKey;
  }