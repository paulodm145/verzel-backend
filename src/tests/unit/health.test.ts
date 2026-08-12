import { describe, expect, it } from "vitest";

import { checkHealth } from "../../modules/health/health.service.js";

const up = () => Promise.resolve(true);
const hangs = () => new Promise<boolean>(() => undefined);

describe("checkHealth", () => {
  it("marca como down a checagem que trava, em vez de esperar por ela", async () => {
    const report = await checkHealth(
      { database: up, cache: hangs },
      { timeoutMs: 50 },
    );

    expect(report.status).toBe("degraded");
    expect(report.services.cache).toBe("down");
  });

  it("responde error quando é o banco que trava — sem ele não há serviço", async () => {
    const report = await checkHealth(
      { database: hangs, cache: up },
      { timeoutMs: 50 },
    );

    expect(report.status).toBe("error");
    expect(report.services.database).toBe("down");
  });
});
