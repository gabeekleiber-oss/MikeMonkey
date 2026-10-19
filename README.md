# MikeMonkey

An explorable first-person 3D open world in the browser (three.js) that an AI
"world director" keeps rewriting while you play.

**Status:** early development. Progress is tracked in
[Issues](../../issues) and [Milestones](../../milestones).

## Run it

Requires Node 18+.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build in dist/
```

## Controls (planned)

W A S D move, mouse look, Space jump, left click attack, E inventory.

## Layout

```
src/engine/   fixed, trusted engine code (input, loader, terrain, physics)
src/game/     content built through the engine API (later: AI-written)
server/       Node server (NVIDIA API proxy; the key never reaches the browser)
docs/         design and API docs
```

## Secrets

Never commit API keys. Copy `.env.example` to `.env` (gitignored) and fill it in.
See [docs/SECRETS.md](docs/SECRETS.md).
