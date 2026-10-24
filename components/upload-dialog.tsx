"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useAuth } from "./auth-provider";
import { CloseIcon, UploadIcon } from "./icons";

export function UploadDialog({
  open,
  onClose,
  initialKind = "image",
  onUploaded,
}: {
  open: boolean;
  onClose: () => void;
  initialKind?: "image" | "video";
  onUploaded?: () => void;
}) {
  const { user, showToast } = useAuth();
  const [kind, setKind] = useState<"image" | "video">(initialKind);
  const [file, setFile] = useState<File | null>(null);
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const requestRef = useRef<XMLHttpRequest | null>(null);

  if (!open) return null;

  const chooseKind = (next: "image" | "video") => {
    setKind(next);
    setFile(null);
    setThumbnail(null);
    setError("");
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return;
    if (!file) {
      setError("请选择要上传的文件。");
      return;
    }
    setError("");
    setSuccess("");
    const form = new FormData(event.currentTarget);
    form.set("kind", kind);
    form.set("file", file);
    if (thumbnail && kind === "video") form.set("thumbnail", thumbnail);
    const xhr = new XMLHttpRequest();
    requestRef.current = xhr;
    xhr.open("POST", "/api/media");
    xhr.upload.onprogress = (progressEvent) => {
      if (progressEvent.lengthComputable) {
        setProgress(Math.round((progressEvent.loaded / progressEvent.total) * 100));
      }
    };
    xhr.onload = () => {
      setUploading(false);
      let payload: any = null;
      try {
        payload = JSON.parse(xhr.responseText);
      } catch {
        // The server error is shown below.
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        setProgress(100);
        setSuccess(payload?.message || "上传完成，等待审核。");
        showToast("上传完成，媒体已进入审核队列。");
        setFile(null);
        setThumbnail(null);
        onUploaded?.();
      } else {
        setError(payload?.error || `上传失败 (${xhr.status})。`);
      }
    };
    xhr.onerror = () => {
      setUploading(false);
      setError("网络连接中断，请检查网络后重试。");
    };
    xhr.onabort = () => {
      setUploading(false);
      setProgress(0);
      setError("上传已取消。");
    };
    setUploading(true);
    setProgress(0);
    xhr.send(form);
  };

  const cancel = () => {
    if (uploading) {
      requestRef.current?.abort();
    } else {
      onClose();
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !uploading && onClose()}>
      <section className="dialog-panel" role="dialog" aria-modal="true" aria-labelledby="upload-title">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#dcd2c3] bg-[#faf6ed] px-5 py-4">
          <div>
            <p className="eyebrow">Contribute to the archive</p>
            <h2 id="upload-title" className="serif mt-1 text-2xl">Upload a media record</h2>
          </div>
          <button type="button" className="grid h-9 w-9 place-items-center border border-[#dcd2c3]" onClick={cancel} aria-label="Close upload dialog">
            <CloseIcon />
          </button>
        </div>

        {!user ? (
          <div className="p-6">
            <p className="text-sm leading-7 text-[#756e64]">
              照片与视频上传需要登录。档案审核制度要求上传者身份可追溯，但你的邮箱不会公开。
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/login" className="button-primary">Sign in</Link>
              <Link href="/register" className="button-secondary">Create account</Link>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="grid gap-5 p-5 sm:p-6">
            <div className="grid grid-cols-2 gap-2">
              {(["image", "video"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => chooseKind(option)}
                  className={`border p-4 text-left transition ${
                    kind === option ? "border-[#394b60] bg-[#eaf1f7]" : "border-[#dcd2c3] bg-[#fffdf8]"
                  }`}
                >
                  <span className="text-[9px] font-bold uppercase tracking-[.14em] text-[#756e64]">
                    {option === "image" ? "01 · Photograph" : "02 · Video file"}
                  </span>
                  <span className="serif mt-1 block text-xl">
                    {option === "image" ? "Upload a photo" : "Upload a video"}
                  </span>
                </button>
              ))}
            </div>

            <div className="border border-dashed border-[#bdb2a3] bg-[#fffdf8] p-5">
              <label className="field-label" htmlFor="media-file">
                {kind === "image" ? "Photo file · JPEG / PNG / WebP / GIF" : "Video file · MP4 / WebM / MOV / Ogg"}
              </label>
              <input
                id="media-file"
                name="file"
                type="file"
                required
                accept={
                  kind === "image"
                    ? "image/jpeg,image/png,image/webp,image/gif"
                    : "video/mp4,video/webm,video/quicktime,video/ogg"
                }
                onChange={(event) => setFile(event.target.files?.[0] || null)}
                className="block w-full text-xs text-[#756e64]"
              />
              <p className="mt-3 text-[10px] leading-5 text-[#756e64]">
                {kind === "image" ? "最大 25 MB。JPEG、PNG 与 WebP 会移除可识别的 EXIF/XMP 元数据。" : "最大 250 MB。优先使用 MP4/H.264；浏览器无法播放的编码仍可保存，但可能无法在网页内播放。"}
              </p>
              {file ? (
                <p className="mt-2 text-xs font-semibold">
                  {(file.size / 1024 / 1024).toFixed(2)} MB · {file.name}
                </p>
              ) : null}
            </div>

            {kind === "video" ? (
              <div>
                <label className="field-label" htmlFor="video-thumbnail">Cover image · optional</label>
                <input
                  id="video-thumbnail"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={(event) => setThumbnail(event.target.files?.[0] || null)}
                  className="block w-full text-xs text-[#756e64]"
                />
                <p className="mt-2 text-[10px] text-[#756e64]">JPEG / PNG / WebP / GIF，最大 8 MB。</p>
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="field-label" htmlFor="media-title">Title</label>
                <input id="media-title" name="title" className="field" minLength={3} maxLength={140} required placeholder="Describe the moment" />
              </div>
              <div className="sm:col-span-2">
                <label className="field-label" htmlFor="media-description">Description</label>
                <textarea id="media-description" name="description" className="field min-h-24" maxLength={3000} placeholder="What can future visitors learn from this record?" />
              </div>
              <div>
                <label className="field-label" htmlFor="media-category">Category</label>
                <select id="media-category" name="category" className="field">
                  <option>Matches</option>
                  <option>Training</option>
                  <option>Interviews</option>
                  <option>Tactics</option>
                  <option>National team</option>
                  <option>Moments</option>
                </select>
              </div>
              <div>
                <label className="field-label" htmlFor="media-tags">Tags</label>
                <input id="media-tags" name="tags" className="field" placeholder="midfield, 2020, assist" />
              </div>
              <div>
                <label className="field-label" htmlFor="media-credit">Creator / credit</label>
                <input id="media-credit" name="credit" className="field" maxLength={180} placeholder="Photographer or archive" />
              </div>
              <div>
                <label className="field-label" htmlFor="media-source">Canonical source URL · optional</label>
                <input id="media-source" name="sourceUrl" type="url" className="field" placeholder="https://" />
              </div>
            </div>

            <div>
              <label className="field-label" htmlFor="media-rights">Rights & permission declaration</label>
              <textarea
                id="media-rights"
                name="rightsDeclaration"
                className="field min-h-20"
                minLength={10}
                maxLength={2000}
                required
                placeholder="Example: I created this file and grant the archive permission to display it. No third-party rights are infringed."
              />
              <p className="mt-2 text-[10px] leading-5 text-[#756e64]">
                请勿上传未经授权的完整比赛转播、付费内容或绕过访问限制取得的媒体。版权投诉可通过页脚入口提交。
              </p>
            </div>

            <label className="flex items-start gap-3 text-xs leading-6 text-[#756e64]">
              <input type="checkbox" name="allowComments" value="true" defaultChecked className="mt-1" />
              Allow signed-in visitors to discuss this record after it is approved.
            </label>

            {error ? <div className="error-box" role="alert">{error}</div> : null}
            {success ? <div className="notice" role="status">{success} <Link href={user ? `/users/${user.username}` : "/photos"} className="underline">View public activity</Link> · <Link href="/photos?mine=1" className="underline">Review status</Link></div> : null}

            {uploading || progress > 0 ? (
              <div>
                <div className="flex justify-between text-[10px] font-bold uppercase tracking-[.12em] text-[#756e64]">
                  <span>{uploading ? "Uploading" : progress === 100 ? "Complete" : "Stopped"}</span>
                  <span>{progress}%</span>
                </div>
                <div className="mt-2 h-2 bg-[#e5ddd1]">
                  <div className="h-full bg-[#394b60] transition-[width]" style={{ width: `${progress}%` }} />
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap justify-end gap-2 border-t border-[#dcd2c3] pt-4">
              <button type="button" className="button-quiet" onClick={cancel}>
                {uploading ? "Cancel upload" : "Close"}
              </button>
              <button type="submit" className="button-primary" disabled={uploading}>
                <UploadIcon width={15} height={15} /> {uploading ? "Uploading…" : "Submit for review"}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
