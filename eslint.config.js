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
    },
  },
);
