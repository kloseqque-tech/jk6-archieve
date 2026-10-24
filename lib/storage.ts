import { createReadStream, existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { getDataDir } from "./db";

export interface StoredObject {
  body: Uint8Array;
  contentType: string;
  size: number;
}

export interface StorageAdapter {
  name: string;
  putFile(tempPath: string, destination: string, contentType: string): Promise<void>;
  getFile(key: string): Promise<StoredObject | null>;
  deleteFile(key: string): Promise<void>;
  localPath(key: string): string | null;
}

export class LocalStorageAdapter implements StorageAdapter {
  name = "local";
  private root = path.join(getDataDir(), "uploads");

  async putFile(tempPath: string, destination: string, _contentType: string) {
    await mkdir(this.root, { recursive: true });
    const source = await readFile(tempPath);
    await writeFile(path.join(this.root, path.basename(destination)), source, { flag: "wx" });
  }

  async getFile(key: string): Promise<StoredObject | null> {
    const filePath = this.safePath(key);
    if (!filePath || !existsSync(filePath)) return null;
    const body = await readFile(filePath);
    return { body, contentType: "application/octet-stream", size: body.length };
  }

  async deleteFile(key: string) {
    const filePath = this.safePath(key);
    if (filePath) await rm(filePath, { force: true });
  }

  localPath(key: string): string | null {
    const filePath = this.safePath(key);
    return filePath && existsSync(filePath) ? filePath : null;
  }

  createReadStream(key: string) {
    const filePath = this.safePath(key);
    return filePath ? createReadStream(filePath) : null;
  }

  private safePath(key: string) {
    const safe = path.basename(key);
    return safe === key ? path.join(this.root, safe) : null;
  }
}

class SupabaseStorageAdapter implements StorageAdapter {
  name = "supabase";
  private client;
  private bucket: string;

  constructor(url: string, serviceKey: string, bucket: string) {
    this.client = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    this.bucket = bucket;
  }

  async putFile(tempPath: string, destination: string, contentType: string) {
    const body = await readFile(tempPath);
    const { error } = await this.client.storage.from(this.bucket).upload(destination, body, {
      contentType,
      upsert: false,
    });
    if (error) throw new Error(`Supabase storage upload failed: ${error.message}`);
  }

  async getFile(key: string): Promise<StoredObject | null> {
    const { data, error } = await this.client.storage.from(this.bucket).download(key);
    if (error || !data) return null;
    return {
      body: new Uint8Array(await data.arrayBuffer()),
      contentType: data.type || "application/octet-stream",
      size: data.size,
    };
  }

  async deleteFile(key: string) {
    await this.client.storage.from(this.bucket).remove([key]);
  }

  localPath() {
    return null;
  }
}

let adapter: StorageAdapter | null = null;

export function getStorage(): StorageAdapter {
  if (adapter) return adapter;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || "archive-media";
  if (
    process.env.STORAGE_PROVIDER === "supabase" &&
    url &&
    serviceKey &&
    !serviceKey.includes("your-")
  ) {
    adapter = new SupabaseStorageAdapter(url, serviceKey, bucket);
  } else {
    adapter = new LocalStorageAdapter();
  }
  return adapter;
}
