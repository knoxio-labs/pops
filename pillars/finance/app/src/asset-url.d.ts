/**
 * Vite's `?url` import suffix: the module resolves to the built asset's URL
 * rather than to its contents.
 *
 * Declared here rather than pulled in with `vite/client` because this package
 * compiles under a bare `tsc` with `"types": []`, and `vite/client` would also
 * add DOM-adjacent ambient declarations this package has no use for. The one
 * consumer is the PDF worker, which must reach the browser as a fetched asset
 * instead of being bundled into the chunk that spawns it.
 */
declare module '*?url' {
  const url: string;
  export default url;
}
