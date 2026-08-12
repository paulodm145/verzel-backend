import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadDotEnvFile } from "../../shared/config/dotenv.js";

let directory: string;

function writeDotEnv(content: string): string {
  const path = join(directory, ".env");
  writeFileSync(path, content);

  return path;
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "verzel-dotenv-"));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
  delete process.env.VERZEL_DOTENV_FIXTURE;
});

describe("loadDotEnvFile", () => {
  it("põe as variáveis do arquivo em process.env", () => {
    const path = writeDotEnv("VERZEL_DOTENV_FIXTURE=do-arquivo\n");

    loadDotEnvFile(path);

    expect(process.env.VERZEL_DOTENV_FIXTURE).toBe("do-arquivo");
  });

  it("não sobrescreve variável já definida no ambiente", () => {
    process.env.VERZEL_DOTENV_FIXTURE = "do-ambiente";
    const path = writeDotEnv("VERZEL_DOTENV_FIXTURE=do-arquivo\n");

    loadDotEnvFile(path);

    expect(process.env.VERZEL_DOTENV_FIXTURE).toBe("do-ambiente");
  });

  it("não faz nada quando o arquivo não existe", () => {
    expect(() => {
      loadDotEnvFile(join(directory, "ausente"));
    }).not.toThrow();
  });
});
