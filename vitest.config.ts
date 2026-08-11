import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/tests/**/*.test.ts"],
    // Testes de integração compartilham o mesmo banco: rodar arquivos em
    // paralelo produziria interferência entre eles
    fileParallelism: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/generated/**", "src/tests/**", "src/server.ts"],
    },
  },
});
