import { open, readFile, rename, rm } from "node:fs/promises";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime", "video/ogg"]);

export const LIMITS = {
  imageBytes: 25 * 1024 * 1024,
  videoBytes: 250 * 1024 * 1024,
  thumbnailBytes: 8 * 1024 * 1024,
};

export async function inspectAndSanitizeMedia(
  filePath: string,
  declaredMime: string,
  expected: "image" | "video",
): Promise<{ mime: string; extension: string }> {
  const handle = await open(filePath, "r");
  const header = Buffer.alloc(32);
  await handle.read(header, 0, 32, 0);
  await handle.close();

  const detected = detectMime(header);
  const allowed = expected === "image" ? IMAGE_TYPES : VIDEO_TYPES;
  if (!detected || !allowed.has(detected)) {
    await rm(filePath, { force: true });
    const error = new Error(
      expected === "image"
        ? "文件内容不是受支持的 JPEG、PNG、WebP 或 GIF 图片。"
        : "文件内容不是受支持的 MP4、WebM、MOV 或 Ogg 视频。",
    );
    Object.assign(error, { status: 400, code: "INVALID_MEDIA_TYPE" });
    throw error;
  }
  if (declaredMime && declaredMime.startsWith(expected === "image" ? "image/" : "video/")) {
    const canonical = detected;
    if (expected === "image" && declaredMime !== canonical) {
      // The magic bytes are authoritative; this catches renamed files without trusting the extension.
      console.warn(`Media MIME mismatch normalized: ${declaredMime} -> ${canonical}`);
    }
  }
  if (expected === "image") await stripImageMetadata(filePath, detected);
  return { mime: detected, extension: extensionFor(detected) };
}

function detectMime(header: Buffer): string | null {
  if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) return "image/jpeg";
  if (header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return "image/png";
  if (header.subarray(0, 6).toString("ascii") === "GIF87a" || header.subarray(0, 6).toString("ascii") === "GIF89a")
    return "image/gif";
  if (header.subarray(0, 4).toString("ascii") === "RIFF" && header.subarray(8, 12).toString("ascii") === "WEBP")
    return "image/webp";
  if (header[4] === 0x66 && header[5] === 0x74 && header[6] === 0x79 && header[7] === 0x70) {
    const brand = header.subarray(8, 12).toString("ascii");
    return brand === "qt  " ? "video/quicktime" : "video/mp4";
  }
  if (header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return "video/webm";
  if (header.subarray(0, 4).toString("ascii") === "OggS") return "video/ogg";
  return null;
}

function extensionFor(mime: string): string {
  return (
    {
      "image/jpeg": ".jpg",
      "image/png": ".png",
      "image/webp": ".webp",
      "image/gif": ".gif",
      "video/mp4": ".mp4",
      "video/webm": ".webm",
      "video/quicktime": ".mov",
      "video/ogg": ".ogv",
    }[mime] || ".bin"
  );
}

async function stripImageMetadata(filePath: string, mime: string) {
  if (mime === "image/jpeg") {
    const stripped = stripJpegApp1(await readFile(filePath));
    if (stripped.length) await replaceFile(filePath, stripped);
  } else if (mime === "image/png") {
    const stripped = stripPngExif(await readFile(filePath));
    if (stripped.length) await replaceFile(filePath, stripped);
  } else if (mime === "image/webp") {
    const stripped = stripWebpMetadata(await readFile(filePath));
    if (stripped.length) await replaceFile(filePath, stripped);
  }
}

async function replaceFile(filePath: string, body: Buffer) {
  const temp = `${filePath}.sanitized`;
  await (await import("node:fs/promises")).writeFile(temp, body, { flag: "wx" });
  await rename(temp, filePath);
}

function stripJpegApp1(input: Buffer): Buffer {
  if (input[0] !== 0xff || input[1] !== 0xd8) return input;
  const chunks = [input.subarray(0, 2)];
  let offset = 2;
  while (offset + 4 <= input.length) {
    if (input[offset] !== 0xff) break;
    const marker = input[offset + 1];
    if (marker === 0xda) {
      chunks.push(input.subarray(offset));
      break;
    }
    const length = input.readUInt16BE(offset + 2);
    const end = offset + 2 + length;
    if (end > input.length) return input;
    if (marker !== 0xe1) chunks.push(input.subarray(offset, end));
    offset = end;
  }
  return offset >= input.length ? input : Buffer.concat(chunks);
}

function stripPngExif(input: Buffer): Buffer {
  const chunks: Buffer[] = [input.subarray(0, 8)];
  let offset = 8;
  while (offset + 12 <= input.length) {
    const length = input.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > input.length) return input;
    const type = input.subarray(offset + 4, offset + 8).toString("ascii");
    if (type !== "eXIf") chunks.push(input.subarray(offset, end));
    offset = end;
    if (type === "IEND") break;
  }
  return offset >= input.length ? Buffer.concat(chunks) : input;
}

function stripWebpMetadata(input: Buffer): Buffer {
  if (input.subarray(0, 4).toString("ascii") !== "RIFF") return input;
  const chunks: Buffer[] = [];
  let offset = 12;
  while (offset + 8 <= input.length) {
    const type = input.subarray(offset, offset + 4).toString("ascii");
    const length = input.readUInt32LE(offset + 4);
    const end = offset + 8 + length + (length % 2);
    if (end > input.length) return input;
    if (type !== "EXIF" && type !== "XMP ") chunks.push(input.subarray(offset, end));
    offset = end;
  }
  const body = Buffer.concat(chunks);
  const header = Buffer.from("RIFF    WEBP", "ascii");
  header.writeUInt32LE(body.length + 4, 4);
  return Buffer.concat([header, body]);
}
