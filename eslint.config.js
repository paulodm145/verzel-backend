// @ts-check
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // O client do Prisma é gerado; não é código nosso para revisar
    ignores: ["dist/**", "src/generated/**", "coverage/**"],
  },
  js.configs.recommended,

  // Regras que dependem de tipo — a razão de ter linter em TypeScript,
  // e o motivo de o projeto ficar na linha 6 do compilador (ADR 0006)
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Erro de domínio é lançado como classe; exigir Error nativo não agrega
      "@typescript-eslint/only-throw-error": [
        "error",
        { allowThrowingUnknown: false },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },

  {
    files: ["**/*.test.ts", "src/tests/**/*.ts"],
    rules: {
      // Teste de integração exerce caminhos que o tipo não descreve
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },

  {
    // Arquivos fora do tsconfig (configuração e scripts) não têm serviço de
    // tipos disponível; lintar sem as regras que dependem de tipo. O
    // prisma/seed.ts está aqui porque o Prisma espera o seed nesse caminho,
    // enquanto o rootDir do TypeScript é src/ — ele é só o ponto de entrada, e
    // a lógica que importa fica em modules/auth/auth.seed.ts, essa sim tipada.
    files: ["**/*.js", "*.config.ts", "prisma/*.ts"],
    ...tseslint.configs.disableTypeChecked,
  },
);
