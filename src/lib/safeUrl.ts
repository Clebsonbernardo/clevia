/**
 * Devolve a URL apenas quando ela é http(s). Qualquer outro esquema
 * (javascript:, data:, vbscript:, file: ...) é descartado, para que um link
 * vindo de conteúdo gerado por IA ou salvo por outro usuário não possa
 * executar código ao ser clicado.
 */
export function safeUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const value = raw.trim();
  if (!value) return undefined;
  try {
    const parsed = new URL(value, window.location.origin);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}
