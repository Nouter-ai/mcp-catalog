// Si una URL responde como servidor MCP: un initialize por POST. Acepta cualquier 401 (el servidor pide login;
// Salesforce no manda Bearer) o una respuesta JSON-RPC. No sigue redirecciones y lee hasta 4 KB.

const INITIALIZE = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize",
  params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "nouter-catalog", version: "1" } } });

export async function probe(url: string, fetchImpl: typeof fetch = fetch): Promise<{ ok: boolean; detail: string }> {
  let res: Response;
  try {
    res = await fetchImpl(url, { method: "POST", redirect: "manual", signal: AbortSignal.timeout(10_000),
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: INITIALIZE });
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
  if (res.status === 401) return { ok: true, detail: "401: pide login" };
  const type = res.headers.get("content-type") ?? "";
  if (res.status !== 200 || !/application\/json|text\/event-stream/.test(type)) {
    void res.body?.cancel().catch(() => {});
    return { ok: false, detail: `${res.status} ${type || "sin content-type"}` };
  }
  return (await readsJsonRpc(res.body)) ? { ok: true, detail: "200: JSON-RPC" } : { ok: false, detail: "200 sin JSON-RPC" };
}

async function readsJsonRpc(body: ReadableStream<Uint8Array> | null): Promise<boolean> {
  if (!body) return false;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  try {
    while (text.length < 4096) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      if (/"jsonrpc"\s*:\s*"2\.0"/.test(text)) return true;
    }
    return false;
  } finally {
    void reader.cancel().catch(() => {});
  }
}
