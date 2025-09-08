export function sanitizeName(name) {
  return name
    .replace(/[^a-z0-9]+/gi, '_')
    .split('_')
    .filter(Boolean)
    .slice(0, 2)
    .join('_')
    .toLowerCase();
}
