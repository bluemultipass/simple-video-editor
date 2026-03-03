# Claude Code instructions

## Git commits

**Never use `--no-verify`.** Always let the pre-commit hooks run.

The hooks (Husky + lint-staged) enforce formatting, linting, type checking,
and cargo fmt/clippy. If a hook fails, fix the underlying issue and retry —
do not bypass the hook to work around it.
