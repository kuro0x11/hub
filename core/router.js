let handler = () => {};

export const parse = () =>
  location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);

export function start(fn) {
  handler = fn;
  addEventListener('hashchange', () => handler(parse()));
  handler(parse());
}

export function go(path, replace) {
  const hash = '#/' + path;
  if (location.hash === hash) return handler(parse());
  if (replace) location.replace(hash);
  else location.hash = hash;
}

export function back(fallback) {
  if (history.length > 1) history.back();
  else go(fallback, true);
}

export const refresh = () => handler(parse());
