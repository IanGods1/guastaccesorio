// Cliente del SDK oficial de Anthropic, cargado solo cuando se usa la IA (no pesa al abrir la app).
// La llave la pega el administrador y queda guardada en su navegador: por eso el SDK exige el
// permiso "dangerouslyAllowBrowser". Por seguridad: ponle un límite de gasto a la llave en
// console.anthropic.com y bórrala si pierdes el dispositivo.
export async function createAiClient(apiKey) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 });
}
