/// <reference types="vite/client" />

declare module "*.css";
declare module "*.svg" {
  const src: string;
  export default src;
}

/**
 * Force a generic shape on JSON imports so TypeScript doesn't infer a deep
 * literal type from megabyte-scale SRD files (which would crawl `tsc`).
 * Each consumer narrows via `as unknown as <typed shape>`.
 */
declare module "*.json" {
  const value: unknown;
  export default value;
}
