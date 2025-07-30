export function safeStringify(value: any): string {
  const seen = new WeakSet();
  return JSON.stringify(value, (_, val) => {
    if (typeof val === 'object' && val !== null) {
      if (seen.has(val)) {
        return undefined;
      }
      seen.add(val);
    }
    if (typeof val === 'function') {
      return undefined;
    }
    return val;
  });
}
