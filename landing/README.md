# yieldOS landing

Standalone Next.js landing page for yieldOS.

## Local development

From the repository root:

```bash
npm run dev
```

Or from this directory:

```bash
npm run dev
```

## Validation

From the repository root:

```bash
npm test
npm run lint
npm run build
```

## Vercel

For Git deployments from the repository root, `vercel.json` delegates install,
dev, and build commands into `landing/`:

```text
npm --prefix ./landing run build
```

The app is intentionally isolated in this directory so the hackathon repository can keep the main project files at the root.
