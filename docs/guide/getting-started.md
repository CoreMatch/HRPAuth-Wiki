# Quick Start

This page helps you run, preview, and build the wiki site locally.

## Install Dependencies

```bash
npm install
```

## Start the Dev Server

```bash
npm run docs:dev
```

After it starts, open the local URL in your browser to preview changes in real time.

## Build for Production

```bash
npm run docs:build
```

To preview the built output, run:

```bash
npm run docs:preview
```

## Recommended Workflow

1. Add or edit Markdown pages under `docs/`
2. Update navigation or sidebar settings in `docs/.vitepress/config.mts`
3. Preview locally to verify page hierarchy, links, and styles
4. Run a build to confirm the site generates static output correctly
