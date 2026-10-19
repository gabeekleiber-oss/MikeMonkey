# Secrets handling

- The NVIDIA API key is used **only** by the Node server in `server/`.
  The browser talks to our server; it never sees the key.
- Keys live in `.env` (gitignored) or real environment variables. Copy
  `.env.example` to `.env` to get started.
- `server/config.js` reports whether a key is present but never prints it.
- `bash scripts/check-secrets.sh` scans tracked files for key-shaped strings
  and fails if `.env` is tracked. CI will run it on every push (issue #24).

## If a key is ever pasted somewhere public

Treat it as compromised: revoke it at the provider (GitHub: Settings ->
Developer settings -> Tokens; NVIDIA: build.nvidia.com -> API keys) and issue a
new one. Removing it from a later commit does not remove it from git history.
