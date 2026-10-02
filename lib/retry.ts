interface RetryOptions {
    maxRetries: number;
    baseDelayMs: number;
  }
  
  function sleep(
    ms: number
  ): Promise<void> {
    return new Promise(
      (resolve) =>
        setTimeout(resolve, ms)
    );
  }
  
  export async function withRetry<T>(
    operation: () => Promise<T>,
    options: RetryOptions
  ): Promise<T> {
    const {
      maxRetries,
      baseDelayMs,
    } = options;
  
    let lastError: unknown;
  
    for (
      let attempt = 0;
      attempt <= maxRetries;
      attempt++
    ) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
  
        if (attempt === maxRetries) {
          throw error;
        }
  
        const delay =
          baseDelayMs *
          2 ** attempt;
  
        await sleep(delay);
      }
    }
  
    throw lastError;
  }