/** Plain assignment, except for `__proto__`, which would otherwise replace the prototype. */
export function assign(target: Record<string, unknown>, key: string, value: unknown): void {
  if (key === "__proto__") {
    Object.defineProperty(target, key, {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  } else target[key] = value;
}
