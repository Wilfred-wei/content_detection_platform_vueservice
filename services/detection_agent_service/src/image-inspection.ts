export interface ImageFacts {
  mimeType: string;
  width?: number;
  height?: number;
  hasExif: boolean;
  hasXmp: boolean;
}

function jpegDimensions(bytes: Buffer): { width?: number; height?: number } {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1];
    if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > bytes.length) break;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  return {};
}

export function inspectImage(bytes: Buffer): ImageFacts {
  const text = bytes.toString("latin1");
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return {
      mimeType: "image/png",
      width: bytes.readUInt32BE(16),
      height: bytes.readUInt32BE(20),
      hasExif: text.includes("eXIf"),
      hasXmp: text.includes("XML:com.adobe.xmp") || text.includes("xmpmeta"),
    };
  }
  if (bytes.length >= 10 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    return {
      mimeType: "image/jpeg",
      ...jpegDimensions(bytes),
      hasExif: text.includes("Exif\u0000\u0000"),
      hasXmp: text.includes("http://ns.adobe.com/xap/1.0/") || text.includes("xmpmeta"),
    };
  }
  if (bytes.length >= 10 && (text.startsWith("GIF87a") || text.startsWith("GIF89a"))) {
    return { mimeType: "image/gif", width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8), hasExif: false, hasXmp: false };
  }
  if (bytes.length >= 12 && text.startsWith("RIFF") && text.slice(8, 12) === "WEBP") {
    return { mimeType: "image/webp", hasExif: text.includes("EXIF"), hasXmp: text.includes("XMP ") };
  }
  throw new Error("UNSUPPORTED_IMAGE");
}
