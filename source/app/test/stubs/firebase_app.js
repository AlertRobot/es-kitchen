// Test stand-in for firebase/app (store_check.js bundles store.js against these)
export function initializeApp(cfg, name) { return { cfg, name: name || '[DEFAULT]' }; }
