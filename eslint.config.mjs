import eslint from "@eslint/js";
import stylistic from "@stylistic/eslint-plugin";
import {defineConfig} from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
    {
        ignores: ["dist/", "node_modules/", "test/api/"],
    },
    eslint.configs.recommended,
    tseslint.configs.recommended,
    {
        files: ["**/*.ts"],
        plugins: {"@stylistic": stylistic},
        rules: {
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/no-unused-vars": ["error", {args: "none"}],
            "eqeqeq": "error",
            "no-console": "error",
            "@stylistic/quotes": ["error", "double", {avoidEscape: true}],
            "@stylistic/semi": ["error", "always"],
            "@stylistic/indent": ["error", 4, {SwitchCase: 1}],
            "@stylistic/comma-dangle": ["error", "always-multiline"],
            "@stylistic/max-len": ["error", {code: 120}],
            "@stylistic/no-trailing-spaces": "error",
            "@stylistic/eol-last": "error",
        },
    },
);
