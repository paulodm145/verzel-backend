export type ServiceState = "up" | "down";
export type OverallStatus = "ok" | "degraded" | "error";

export interface HealthChecks {
  readonly database: () => Promise<boolean>;
  readonly cache: () => Promise<boolean>;
}

export interface HealthReport {
  readonly status: OverallStatus;
  readonly services: {
    readonly database: ServiceState;
    readonly cache: ServiceState;
  };
}

/** Uma checagem que lança é uma checagem que falhou, não um erro da rota. */
async function probe(check: () => Promise<boolean>): Promise<ServiceState> {
  try {
    return (await check()) ? "up" : "down";
  } catch {
    return "down";
  }
}

/**
 * Estado dos serviços dos quais a aplicação depende.
 *
 * O banco e o cache não têm o mesmo peso. Sem Postgres não há serviço, e a
 * resposta é `error`. Sem Redis o sistema perde o lock e o cache mas continua
 * correto, recusando reservas concorrentes pela constraint (ADR 0003) — por isso
 * é `degraded`, e não falha.
 */
export async function checkHealth(checks: HealthChecks): Promise<HealthReport> {
  const [database, cache] = await Promise.all([
    probe(checks.database),
    probe(checks.cache),
  ]);

  const status: OverallStatus =
    database === "down" ? "error" : cache === "down" ? "degraded" : "ok";

  return { status, services: { database, cache } };
}

export function statusCodeFor(status: OverallStatus): number {
  return status === "error" ? 503 : 200;
}
