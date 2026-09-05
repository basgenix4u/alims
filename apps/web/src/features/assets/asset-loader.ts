export type AssetKind = 'pdf' | 'image' | 'unknown';

export type AssetLoadState =
  | { kind: 'idle' }
  | { kind: 'loading'; loaded: number; total: number | null }
  | { kind: 'ready'; objectUrl: string; mime: string; bytes: number; assetKind: AssetKind }
  | { kind: 'error'; message: string }
  | { kind: 'unsupported'; mime: string };

export function classifyAsset(mime: string): AssetKind {
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('image/')) return 'image';
  return 'unknown';
}

export async function loadAsset(
  input: RequestInfo | URL,
  onProgress?: (loaded: number, total: number | null) => void,
  signal?: AbortSignal,
): Promise<AssetLoadState> {
  const response = await fetch(input, { credentials: 'include', signal });
  if (!response.ok) {
    return { kind: 'error', message: `Asset request failed (${response.status})` };
  }
  const mime =
    response.headers.get('content-type')?.split(';')[0]?.trim() || 'application/octet-stream';
  const assetKind = classifyAsset(mime);
  if (assetKind === 'unknown') {
    return { kind: 'unsupported', mime };
  }

  const totalHeader = response.headers.get('content-length');
  const total = totalHeader ? Number(totalHeader) : null;
  const reader = response.body?.getReader();
  if (!reader) {
    const blob = await response.blob();
    return {
      kind: 'ready',
      objectUrl: URL.createObjectURL(blob),
      mime,
      bytes: blob.size,
      assetKind,
    };
  }

  const chunks: ArrayBuffer[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      const copy = new Uint8Array(value.byteLength);
      copy.set(value);
      chunks.push(copy.buffer);
      loaded += value.byteLength;
      onProgress?.(loaded, total);
    }
  }
  const blob = new Blob(chunks, { type: mime });
  return {
    kind: 'ready',
    objectUrl: URL.createObjectURL(blob),
    mime,
    bytes: blob.size,
    assetKind,
  };
}
