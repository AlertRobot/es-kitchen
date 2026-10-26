// Plans the week in the background so the app stays responsive while "Fill it for me" works (a second or more on a mid-range phone).
import Core from './core.js';
self.onmessage = e => {
  const { id, w, C, opts } = e.data;
  try { self.postMessage({ id, ok: true, filled: Core.autoFill(w, C, opts) }); }
  catch (err) { self.postMessage({ id, ok: false, error: String(err && err.message || err) }); }
};
