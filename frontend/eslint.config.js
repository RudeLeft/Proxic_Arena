// ESLint flat config — PHASE_01 §1.87.
//
// Type-aware linting is on deliberately. The rules that matter here
// are the ones that need types: a floating promise, a misused
// `await`, an unnecessary condition. Syntax-only linting would find
// formatting, which Prettier already owns.

import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "*.config.js"] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // An unhandled rejection in a status poller or a renderer
      // mount is invisible until the page quietly stops updating.
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      // Deliberate: `catch {}` around browser storage and teardown
      // is a documented pattern here, not an oversight.
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  // Build config lives outside the app's tsconfig project. Turning
  // the RULES off is not enough -- the parser still tries to load
  // type information and fails outright, so the project reference
  // has to be cleared too. Last, so it wins.
  {
    files: ["*.config.ts"],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: { parserOptions: { project: false } },
  },
);
