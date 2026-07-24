/** Чтение query-параметра без URLSearchParams — работает в ранних Safari. */
export function queryParam(name: string): string | null {
  const encodedName = encodeURIComponent(name);
  for (const part of location.search.replace(/^\?/, '').split('&')) {
    if (!part) continue;
    const [rawKey, ...rawValue] = part.split('=');
    if (rawKey !== encodedName) continue;
    try {
      return decodeURIComponent(rawValue.join('=').replace(/\+/g, ' '));
    } catch {
      return rawValue.join('=');
    }
  }
  return null;
}

export function withQueryParam(name: string, value: string | null): string {
  const encodedName = encodeURIComponent(name);
  const parts = location.search
    .replace(/^\?/, '')
    .split('&')
    .filter((part) => part && part.split('=')[0] !== encodedName);
  if (value !== null) parts.push(`${encodedName}=${encodeURIComponent(value)}`);
  return `${location.pathname}${parts.length ? `?${parts.join('&')}` : ''}${location.hash}`;
}
