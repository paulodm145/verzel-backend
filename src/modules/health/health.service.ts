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

export interface HealthOptions {
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 3_000;

/**
 * Falha a promessa que demora demais. Serviço fora do ar nem sempre recusa a
 * conexão: ele pode simplesmente não responder, e aí `catch` não basta — sem
 * prazo, a checagem espera para sempre e leva a rota junto.
 */
function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`checagem excedeu ${String(timeoutMs)} ms`));
    }, timeoutMs);

    work.then(resolve, reject).finally(() => {
      clearTimeout(timer);
    });
  });
}

/** Uma checagem que lança, ou que trava, é uma checagem que falhou. */
async function probe(
  check: () => Promise<boolean>,
  timeoutMs: number,
): Promise<ServiceState> {
  try {
    return (await withTimeout(check(), timeoutMs)) ? "up" : "down";
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
export async function checkHealth(
  checks: HealthChecks,
  options: HealthOptions = {},
): Promise<HealthReport> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const [database, cache] = await Promise.all([
    probe(checks.database, timeoutMs),
    probe(checks.cache, timeoutMs),
  ]);

  const status: OverallStatus =
    database === "down" ? "error" : cache === "down" ? "degraded" : "ok";

  return { status, services: { database, cache } };
}

export function statusCodeFor(status: OverallStatus): number {
  return status === "error" ? 503 : 200;
}
