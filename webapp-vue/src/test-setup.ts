// Make the vue-router file-based routing macro available in the test environment.
// At build time the VueRouter vite plugin transforms `definePage()` calls;
// at test time (no vite plugin) it is a no-op — identical to the runtime
// implementation in vue-router/experimental.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).definePage = (route: unknown) => route
