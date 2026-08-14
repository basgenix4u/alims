/**
 * @alims/contracts — the single source of truth shared by API and web.
 *
 * Importing these schemas on both sides makes api_specification.md a
 * compile-time dependency: the frontend cannot call an endpoint shape that
 * the backend does not implement, and neither can drift silently.
 */
export * from './enums';
export * from './common';
export * from './auth';
export * from './record';
export * from './certificate';
