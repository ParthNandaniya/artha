# Cloudflare Integration

Cloudflare Pages hosts company websites with automatic deployment from GitHub.

## Setup Flow

```
Pipeline Step 12
        │
        ▼
createPagesProject(slug, githubOrg)
        │
        ├─ Creates Cloudflare Pages project
        ├─ Connects to GitHub repo (artha-companies/{slug})
        ├─ Build config: no build command, output dir: "website"
        │
        ▼
addCustomDomain(slug, domain)
        │
        └─ Maps {slug}.tryartha.com → Pages project
        │
        ▼
Site live at https://{slug}.tryartha.com
```

## Key Functions

### `createPagesProject(slug, githubOrg)`

Creates a Cloudflare Pages project connected to a GitHub repo.
- Handles "already exists" gracefully (returns existing project)
- Configures to deploy from `main` branch, `/website` directory

### `syncPagesProjectBuildConfig(slug)`

Updates build settings: `production_branch=main`, no build command, `destination_dir=website`.

### `addCustomDomain(slug, domain)`

Adds `{slug}.tryartha.com` as a custom domain. Detects duplicate domains on different projects.

### `setupCloudflarePages(slug, githubOrg)`

Full setup flow: create project → sync config → add domain.

### `deletePagesProject(slug)`

Cleanup when a project is deleted or database expires.

## Auto-Deploy

After initial setup, any push to the `main` branch of the GitHub repo triggers an automatic Cloudflare Pages deployment. This means website updates flow:

```
AI generates new HTML → Push to GitHub → Cloudflare auto-deploys
```

## Configuration

| Variable | Description |
|----------|-------------|
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account identifier |
| `CLOUDFLARE_API_TOKEN` | API token with Pages permissions |

## File Reference

- `src/lib/cloudflare.ts` — All Cloudflare API interactions
