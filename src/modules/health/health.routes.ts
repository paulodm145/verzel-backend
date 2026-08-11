import { Router } from "express";

import { prisma } from "../../shared/lib/prisma.js";
import { getRedis } from "../../shared/lib/redis.js";
import {
  checkHealth,
  statusCodeFor,
  type HealthChecks,
} from "./health.service.js";

const defaultChecks: HealthChecks = {
  database: async () => {
    await prisma.$queryRawUnsafe("SELECT 1");
    return true;
  },
  cache: async () => {
    const redis = await getRedis();
    return (await redis.ping()) === "PONG";
  },
};

/**
 * As checagens entram por parâmetro para que o teste possa exercitar a rota com
 * um serviço fora do ar sem derrubar a infraestrutura de verdade (CA-7).
 */
export function createHealthRouter(checks: HealthChecks = defaultChecks): Router {
  const router = Router();

  router.get("/health", async (_request, response) => {
    const report = await checkHealth(checks);

    response.status(statusCodeFor(report.status)).json(report);
  });

  return router;
}
