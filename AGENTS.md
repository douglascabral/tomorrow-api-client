# Tomorrow API Client

Tomorrow is an offline-first desktop client for HTTP and REST APIs. It supports Windows, macOS, and Linux.

## Product requirements

- Let users create or unlock a workspace at startup and switch workspaces at any time.
- Encrypt workspace data at rest with a password. This includes collections, requests, environments, and credentials. A lost password cannot be recovered.
- Use the operating system language when supported and fall back to English. Maintain English and Brazilian Portuguese translations.
- Support importing from and exporting to Postman.
- Keep the application free of telemetry and unsolicited background network requests. Send API requests only through user-initiated actions.

## Project conventions

- Keep Go application code in `src/`, internal Go packages in `src/internal/`, and the Svelte and TypeScript frontend in `src/frontend/`.
- Use the dependency versions declared in `src/go.mod`, `src/frontend/package.json`, and the relevant lockfiles.
- Keep code and contributor documentation in English. Put user-facing strings in the locale files.
- Write commit messages in English and follow Conventional Commits. Use an imperative subject in the format `type(scope): description`, with an optional scope. For example, `feat(release): automate desktop packaging`.
- Reuse existing helpers and components. Prefer standard library and platform features before adding dependencies.
- Use named constants for limits, timeouts, and other domain-specific values.
- Keep the interface minimal and consistent with existing components. Add or update Storybook stories when creating or changing reusable components.
- Update `README.md` when behavior, setup, configuration, or operating procedures change.
- Keep generated builds, local environments, and secrets out of Git. Do not read ignored files or include their contents in verification output.

## Development workflow

- Before changing behavior, write concise acceptance criteria in the task or pull request. Resolve ambiguities that affect behavior before implementing.
- For each behavior change, write the relevant test first, confirm it fails for the expected reason, implement the smallest fix, and rerun it. Add a regression test for each bug fix.
- Record the red and green results in the task or pull request. If you could not run the test before implementing, record why.
- Use Go tests for backend behavior and Playwright for user-facing workflows.

## Releases

- Follow Semantic Versioning (`MAJOR.MINOR.PATCH`). Increment MAJOR for incompatible changes, MINOR for backward compatible features, and PATCH for backward compatible fixes.
- When changing the product version, keep the README, default package version, frontend package metadata and lockfile, and the frontend and Go HTTP user agents in sync. Update their test expectations too.
- Before preparing any version tag, write English release notes in `docs/releases/<tag>.md` using the exact tag, including the `v` prefix. Summarize user-facing changes since the previous release and include any known installation limitations.
- Include the notes in the commit the tag points to. The release workflow uses the Markdown file as the GitHub Release description.

## Verification

Run these checks before marking a change complete:

- `make check` for Go tests, frontend type checks, and the production build.
- `make e2e` for Playwright tests.
- `make lint` for complexity and duplication checks.
- `make security` for Gitleaks and Trivy scans.
- `make build-storybook` when components or their stories change.

Use the repository targets so checks use the project's configured exclusions. Keep duplication below 5%. Fix failures without disabling tests or checks, and report any verification blocked by the environment.
