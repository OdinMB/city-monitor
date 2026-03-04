# Contributing to City Monitor

Thanks for your interest in contributing! Here's how to get started.

## How to Contribute

1. **Fork** the repository
2. **Create a branch** from `main` for your change
3. **Make your changes** — see [Getting Started](README.md#getting-started) for dev setup
4. **Run checks** before submitting:
   ```bash
   npm run typecheck
   npm run lint
   npx turbo run test
   ```
5. **Open a pull request** against `main` with a clear description of what you changed and why

## What to Work On

- Bug fixes and improvements are always welcome
- For larger changes or new features, please open an issue first to discuss the approach
- Check existing issues for things that need help

## Code Style

- Follow existing patterns in the codebase
- TypeScript strict mode is enabled — no `any` types
- Both packages have their own Vitest config; run tests through `turbo` (see [README](README.md))

## Contributor License Agreement

By submitting a pull request, you agree to the following:

- Your contribution is licensed under **AGPL-3.0-or-later**, the same license as the project.
- You waive any exclusive copyright claim over your contribution, granting the project maintainer (Odin Muhlenbein) the right to relicense the project or transfer stewardship in the future.
- You confirm that you have the right to submit the contribution and that it does not violate any third-party rights.

This is a lightweight "inbound = outbound + waiver" approach — no separate CLA signing required.
