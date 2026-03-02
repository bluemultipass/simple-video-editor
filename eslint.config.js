import tseslint from "typescript-eslint";
import solidPlugin from "eslint-plugin-solid";

export default tseslint.config(
  { ignores: ["dist", "src-tauri"] },

  // TypeScript strict type-checked rules for TS/TSX files
  {
    extends: [...tseslint.configs.strictTypeChecked],
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      solid: solidPlugin,
    },
    rules: {
      ...solidPlugin.configs.typescript.rules,
      // Allow _-prefixed args to be unused (common convention for unused params)
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Warn on console.log but allow console.warn/error for legitimate use
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
);
