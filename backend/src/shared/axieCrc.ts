// CRC32 puro (para firmar el "secret")
const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(s: string): number {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < s.length; i++) c = (c >>> 8) ^ TABLE[(c ^ s.charCodeAt(i)) & 0xFF];
  return (c ^ 0xFFFFFFFF) >>> 0;
}
