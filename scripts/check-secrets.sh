#!/usr/bin/env bash
# Fails if anything that looks like a real key is tracked by git.
# Run manually or in CI: bash scripts/check-secrets.sh
set -u
pattern='(nvapi-[A-Za-z0-9_-]{20,}|github_pat_[A-Za-z0-9_]{20,}|ghp_[A-Za-z0-9]{30,}|gho_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9]{32,})'
hits=$(git grep -nEI "$pattern" -- . ':!scripts/check-secrets.sh' 2>/dev/null || true)
if [ -n "$hits" ]; then
  echo "Possible secrets found in tracked files (values hidden):"
  echo "$hits" | sed -E 's/(nvapi-|github_pat_|ghp_|gho_|sk-)[A-Za-z0-9_-]+/\1***REDACTED***/g'
  exit 1
fi
if git ls-files --error-unmatch .env >/dev/null 2>&1; then
  echo ".env is tracked by git - remove it with: git rm --cached .env"
  exit 1
fi
echo "No secrets found."
