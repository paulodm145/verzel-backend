import { pino, type Logger } from "pino";

import { getEnv } from "../config/index.js";

let cached: Logger | undefined;

export function getLogger(): Logger {
  if (cached) {
    return cached;
  }

  const env = getEnv();

  cached = pino({
    level: env.LOG_LEVEL,
    // Em desenvolvimento o log é lido por gente; em produção, por máquina
    ...(env.NODE_ENV === "development"
      ? { transport: { target: "pino-pretty", options: { colorize: true } } }
      : {}),
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "*.passwordHash",
        "*.password",
      ],
      censor: "[redigido]",
    },
  });

  return cached;
}
