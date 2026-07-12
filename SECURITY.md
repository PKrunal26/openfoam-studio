# Security Policy

## Reporting a vulnerability

Please **do not open a public GitHub issue** for security vulnerabilities.

Report privately by email to **26.krunal@gmail.com** with:

- A description of the issue and its impact
- Steps to reproduce
- Affected version or commit

You can expect an acknowledgement within a few days. Please give a reasonable window to
release a fix before any public disclosure.

If you use GitHub, you may also report through **Security > Report a vulnerability** (Private
Vulnerability Reporting) on the repository.

## Supported versions

This is an early-stage project. Security fixes are applied to the latest release on `main`.
Older versions are not maintained.

## Scope and design notes

A few things are good to know when assessing risk:

- **API keys (BYOK):** The app uses your own LLM provider key. Keys are stored locally on your
  machine and are never committed. `.env` is gitignored. Reports of keys leaking into logs,
  builds, or network calls to unexpected hosts are in scope.
- **Docker command allowlist:** OpenFOAM commands run through a vetted runner
  (`core/docker/CommandRunner.ts`). No raw shell access is exposed to the AI agent. Any path
  that lets the agent or a crafted prompt run an un-allowlisted command on the host or in the
  container is in scope.
- **File writing:** Generated case files are written under managed project directories. Path
  traversal that writes outside those directories is in scope.

## Out of scope

- Vulnerabilities in OpenFOAM itself, Docker, or third-party LLM providers
- Issues that require a already-compromised local machine
- Missing code-signing on prebuilt binaries (a known limitation, see the README)
