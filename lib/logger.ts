type LogLevel =
  | "info"
  | "warn"
  | "error";

interface LogContext {
  [key: string]: unknown;
}

function serializeError(
  error: unknown
) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    message: String(error),
  };
}

function log(
  level: LogLevel,
  event: string,
  context: LogContext = {}
) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...context,
  };

  const output =
    JSON.stringify(entry);

  if (level === "error") {
    console.error(output);
    return;
  }

  if (level === "warn") {
    console.warn(output);
    return;
  }

  console.log(output);
}

export const logger = {
  info(
    event: string,
    context?: LogContext
  ) {
    log(
      "info",
      event,
      context
    );
  },

  warn(
    event: string,
    context?: LogContext
  ) {
    log(
      "warn",
      event,
      context
    );
  },

  error(
    event: string,
    context: LogContext = {}
  ) {
    log(
      "error",
      event,
      {
        ...context,
        error: context.error
          ? serializeError(
              context.error
            )
          : undefined,
      }
    );
  },
};