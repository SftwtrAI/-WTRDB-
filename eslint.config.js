import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2022,
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    rules: {
      semi: ["error", "always"],
      quotes: [
        "warn",
        "double",
        { avoidEscape: true, allowTemplateLiterals: true },
      ],
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-extend-native": "error",
      "no-global-assign": "error",
      "no-var": "error",
      "prefer-const": "warn",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-non-null-assertion": "warn",
      camelcase: [
        "warn",
        {
          properties: "never",
          ignoreDestructuring: true,
          ignoreImports: true,
          ignoreGlobals: true,
          allow: ["^[a-z]+(_[a-z]+)*$"],
        },
      ],
      "new-cap": [
        "warn",
        {
          newIsCap: true,
          capIsNew: false,
          properties: false,
        },
      ],
      radix: "error",
      eqeqeq: ["warn", "always", { null: "ignore" }],
      "no-console": "off",
      "no-debugger": "error",
      "no-alert": "error",
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-duplicate-imports": "error",
      "no-useless-constructor": "off",
      "@typescript-eslint/no-useless-constructor": "warn",
      "prefer-template": "warn",
      "no-nested-ternary": "warn",
      "max-depth": ["warn", 4],
      complexity: ["warn", 20],
      "no-throw-literal": "error",
      "prefer-promise-reject-errors": "error",
    },
  },
  {
    files: ["**/*.tsx", "**/*.jsx"],
    rules: {
      camelcase: "off",
    },
  },
  {
    files: ["server/**/*.ts"],
    rules: {
      "no-console": "off",
    },
  },
  {
    ignores: [
      "node_modules/",
      "dist/",
      "build/",
      "**/*.min.js",
      "**/*.config.js",
      "**/*.config.ts",
      "drizzle.config.ts",
    ],
  },
);
