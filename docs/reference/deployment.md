# Deployment

VitePress produces static assets, so this site can be deployed to most static hosting platforms.

## Build Command

```bash
npm run docs:build
```

The default output directory is:

```text
docs/.vitepress/dist
```

## Common Deployment Targets

- Nginx static hosting
- GitHub Pages
- Vercel
- Netlify
- Internal object storage or CDN

## Pre-Deployment Checks

1. Run a local build
2. Check that page links and navigation work
3. Confirm whether you need a custom domain or base path
4. Add a `base` config if the site will be served from a subpath

## Good Next Steps

If this site later becomes part of a formal release workflow, consider adding:

- CI builds
- PR preview environments
- link checking
- content review steps
