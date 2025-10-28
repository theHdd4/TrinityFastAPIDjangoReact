# Trinity Frontend

This package contains the Trinity web experience. It is a Vite + React + TypeScript application styled with Tailwind CSS and shadcn/ui components.

## Getting started

1. Install dependencies:
   ```bash
   npm install
   ```
2. Run the local development server:
   ```bash
   npm run dev
   ```
3. Build for production:
   ```bash
   npm run build
   ```
4. Preview the production bundle locally:
   ```bash
   npm run preview
   ```

## Project structure

- `src/` – React components, hooks, contexts, and routes used throughout the Trinity application.
- `public/` – Static assets such as favicons, Open Graph images, and background media.
- `vite.config.ts` – Vite configuration for development and build tooling.

## Additional notes

- Environment variables can be configured in `.env` files following the standard Vite conventions.
- Linting is available via `npm run lint`.

For more information on the Trinity platform and brand guidelines, please refer to the internal design system documentation.
