/** Read a design-token CSS custom property as a 0–1 RGB triple for WebGL. */
export function cssVarRgb(name: string, el: Element): [number, number, number] {
  const raw =
    getComputedStyle(el).getPropertyValue(name).trim() ||
    getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (raw.startsWith('#') && raw.length >= 7) {
    return [
      parseInt(raw.slice(1, 3), 16) / 255,
      parseInt(raw.slice(3, 5), 16) / 255,
      parseInt(raw.slice(5, 7), 16) / 255,
    ];
  }
  const m = raw.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (m) {
    return [Number(m[1]) / 255, Number(m[2]) / 255, Number(m[3]) / 255];
  }
  const probe = document.createElement('span');
  probe.className = name.includes('verified')
    ? 'text-green-800'
    : name.includes('advisory')
      ? 'text-amber-800'
      : name.includes('parchment')
        ? 'bg-surface-subtle'
        : 'text-brand';
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  document.body.appendChild(probe);
  const computed = getComputedStyle(probe);
  const source = name.includes('parchment') ? computed.backgroundColor : computed.color;
  document.body.removeChild(probe);
  const parsed = source.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (parsed) {
    return [Number(parsed[1]) / 255, Number(parsed[2]) / 255, Number(parsed[3]) / 255];
  }
  return [0, 0, 0];
}
