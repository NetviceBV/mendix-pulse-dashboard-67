export async function pingRailwayHealth(baseUrl: string, apiKey?: string): Promise<void> {
  const healthUrl = `${baseUrl.replace(/\/$/, '')}/health`
  console.log(`[Railway] Pinging health endpoint: ${healthUrl}`)
  try {
    const headers: Record<string, string> = {}
    if (apiKey) headers['X-API-Key'] = apiKey
    const res = await fetch(healthUrl, { method: 'GET', headers })
    console.log(`[Railway] Health check response: ${res.status}`)
  } catch (e) {
    console.log(`[Railway] Health ping failed (container may be waking): ${e}`)
  }
}
