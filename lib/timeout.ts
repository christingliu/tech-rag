export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message?: string
): Promise<T> {
  let timer: NodeJS.Timeout;

  const timeoutPromise =
    new Promise<never>(
      (_, reject) => {
        timer = setTimeout(() => {
          reject(
            new Error(
              message ??
                `Operation timed out after ${timeoutMs}ms`
            )
          );
        }, timeoutMs);
      }
    );

  try {
    return await Promise.race([
      promise,
      timeoutPromise,
    ]);
  } finally {
    clearTimeout(timer!);
  }
}