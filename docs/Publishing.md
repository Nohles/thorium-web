# Publishing `@nohles/thorium-web` to Verdaccio

This package is published to the team [Verdaccio](https://verdaccio.org/) registry on the local network, not npmjs.org.

| | |
| --- | --- |
| **Package** | `@nohles/thorium-web` |
| **Registry** | `http://192.168.1.202:4873/` |
| **Web UI** | [Package detail page](http://192.168.1.202:4873/-/web/detail/@nohles/thorium-web) |

The repo is already configured so `pnpm publish` targets that registry (`publishConfig` in `package.json`, `@nohles` scope in `.npmrc`).

## One-time setup

### 1. Reach the registry

You must be on a network that can reach `192.168.1.202` (same LAN/VPN as the Verdaccio host).

Quick check:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://192.168.1.202:4873/
```

A `200` or `404` response means the server is reachable.

### 2. Log in (if required)

If your Verdaccio instance requires authentication:

```bash
npm login --registry http://192.168.1.202:4873/
```

Use the credentials configured on the Verdaccio server. Credentials are stored in your user-level `~/.npmrc` (not committed to this repo).

### 3. Install dependencies

From the repo root:

```bash
pnpm install
```

## Every publish

### Option A — Bump version and publish (usual flow)

Pick the semver bump you need, then publish in one step:

```bash
# patch: 1.5.2 → 1.5.3  (bug fixes)
pnpm release:patch

# minor: 1.5.2 → 1.6.0  (new features, backwards compatible)
pnpm release:minor

# major: 1.5.2 → 2.0.0  (breaking changes)
pnpm release:major
```

Each `release:*` script:

1. Bumps `version` in `package.json` (and plugin version strings via `scripts/increment.mjs`)
2. Runs `pnpm bundle` (via `prepublishOnly`)
3. Publishes to Verdaccio

Commit the version bump after a successful publish:

```bash
git add package.json src/components/Plugins/helpers/createDefaultPlugin.ts src/components/Plugins/helpers/createAudioDefaultPlugin.ts
git commit -m "chore: release @nohles/thorium-web vX.Y.Z"
```

Replace `X.Y.Z` with the new version.

### Option B — Publish the current version (no bump)

If `package.json` already has the version you want:

```bash
pnpm publish:verdaccio
```

This still runs `pnpm bundle` before upload (`prepublishOnly`).

To bump manually first:

```bash
pnpm increment patch   # or minor | major
pnpm publish:verdaccio
```

### Verify on the registry

- Open the [web UI](http://192.168.1.202:4873/-/web/detail/@nohles/thorium-web) and confirm the new version appears.
- Or from the CLI:

```bash
npm view @nohles/thorium-web version --registry http://192.168.1.202:4873/
```

## Consuming the package in another project

Add to the consuming app’s `.npmrc` (project root or user `~/.npmrc`):

```ini
@nohles:registry=http://192.168.1.202:4873/
```

Then install:

```bash
pnpm add @nohles/thorium-web
# or
npm install @nohles/thorium-web
```

Install peer dependencies as described in [packages ReadMe](./packages/ReadMe.md).

## Troubleshooting

| Problem | What to try |
| --- | --- |
| `ECONNREFUSED` / timeout | VPN/LAN, firewall, Verdaccio service up on `192.168.1.202` |
| `401 Unauthorized` | `npm login --registry http://192.168.1.202:4873/` |
| `403` on publish | User lacks publish rights for `@nohles` on Verdaccio |
| `You cannot publish over the previously published versions` | Run `pnpm increment patch` (or higher) then publish again |
| pnpm refuses to publish with uncommitted changes | Commit/stash first, or `pnpm publish --no-git-checks` (use sparingly) |
| Wrong registry | Confirm `publishConfig.registry` in `package.json` and `@nohles:registry` in `.npmrc` |

## What gets published

Only the `dist/` folder is included (`files` in `package.json`). The `prepublishOnly` / `bundle` step builds that output (locales, fonts, ESM bundles, types).

Do not publish without bundling; always use `pnpm publish:verdaccio` or `pnpm release:*`, not raw `npm publish` unless you have already run `pnpm bundle`.
