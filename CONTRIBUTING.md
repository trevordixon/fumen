# Contributing

## Setup

- Use Node.js `20.x` (see `.nvmrc`).
- Install dependencies with:

```bash
npm ci
```

## Development

- Type/lint checks:

```bash
npm run ci:strict
```

- Build outputs (not committed):

```bash
npm run build
```

- API smoke test:

```bash
npm run test:api-smoke
```

- Clean generated artifacts:

```bash
npm run clean
```

## Repository policy

- `dist/` is generated and intentionally not tracked.
- Keep commits focused by concern (tooling, API, module migrations, docs).
- Do not use TypeScript escape hatches (`@ts-ignore`, `@ts-expect-error`, `as unknown as`).

## Pull requests

- Ensure `npm run ci:strict` passes before opening PR.
- Include a short summary of behavior changes and migration impact (if any).
