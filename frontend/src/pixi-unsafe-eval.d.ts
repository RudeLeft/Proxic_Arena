// PHASE_03 §3.100 — PixiJS 8.2.6 publishes the `pixi.js/unsafe-eval`
// subpath in its package exports but ships no useful types for it
// (its init.d.ts is `export {}`), so TypeScript cannot resolve the
// side-effect import that keeps the renderer working under a CSP
// without 'unsafe-eval'. Declaring it is a types-only statement: it
// asserts the module exists, which `node_modules/pixi.js/lib/
// unsafe-eval/init.mjs` and the e2e Pixi check both confirm.
declare module "pixi.js/unsafe-eval";
