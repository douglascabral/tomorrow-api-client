#!/usr/bin/env bash
set -euo pipefail

scan_dir="$(mktemp -d)"
trap 'rm -rf "$scan_dir"' EXIT

while IFS= read -r -d '' relative_path; do
  if git check-ignore --no-index -q -- "$relative_path" 2>/dev/null; then
    continue
  fi
  case "$relative_path" in
    src/frontend/node_modules/*|src/frontend/dist/*|src/frontend/storybook-static/*|src/frontend/test-results/*|src/frontend/playwright-report/*|src/frontend/coverage/*|src/node_modules/*|build/*)
      continue
      ;;
  esac
  file_name="${relative_path##*/}"
  case "$file_name" in
    .env|.env.*) continue ;;
  esac
  if [[ -L "$relative_path" || ! -f "$relative_path" ]]; then
    continue
  fi
  mkdir -p "$scan_dir/$(dirname "$relative_path")"
  cp -- "$relative_path" "$scan_dir/$relative_path"
done < <(git ls-files -z --cached --others --exclude-standard)

"${GITLEAKS:-gitleaks}" detect --no-git --redact --no-banner --source "$scan_dir"
"${TRIVY:-trivy}" fs --scanners vuln,misconfig,secret "$scan_dir"
