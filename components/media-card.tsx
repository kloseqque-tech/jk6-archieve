import Link from "next/link";
import type { MediaItem } from "@/lib/types";
import { ArrowUpRight, MessageIcon, PlayIcon } from "./icons";

export function SourceBadge({ item }: { item: MediaItem }) {
  const label = item.isDemo ? "Demo artwork" : item.sourceType === "upload" ? "Uploaded file" : "External media";
  return <span className={`source-badge ${item.sourceType}`}>{label}</span>;
}

export function MediaCard({ item, index = 1 }: { item: MediaItem; index?: number }) {
  const detailHref = `/${item.kind === "video" ? "videos" : "photos"}/${item.id}`;
  return (
    <article className="archive-card fade-up">
      <Link href={detailHref} className="archive-card-media block" aria-label={`Open ${item.title}`}>
        {item.thumbnailUrl || item.previewUrl ? (
          // Uploaded and demonstration artwork is displayed at its natural aspect ratio inside a fixed archival frame.
          // Plain img is intentional because remote source URLs may not be allow-listed for the Next image optimizer.
          <img src={item.thumbnailUrl || item.previewUrl || ""} alt="" loading="lazy" />
        ) : (
          <div className="grid h-full place-items-center bg-[#dce8f3] text-[#394b60]">
            <span className="serif text-7xl">06</span>
          </div>
        )}
        <span className="card-number">{String(index).padStart(2, "0")}</span>
        {item.kind === "video" ? (
          <span className="absolute inset-0 grid place-items-center">
            <span className="grid h-14 w-14 place-items-center rounded-full border border-[#fffdf8]/70 bg-[#394b60]/90 text-[#fffdf8] shadow-lg">
              <PlayIcon width={20} height={20} />
            </span>
          </span>
        ) : null}
      </Link>
      <div className="archive-card-body">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[9px] font-bold uppercase tracking-[.18em] text-[#756e64]">{item.category}</span>
          <SourceBadge item={item} />
        </div>
        <h3 className="serif mt-4 text-[1.55rem] leading-[1.1] tracking-[-.025em]">{item.title}</h3>
        <p className="mt-2 line-clamp-2 text-xs leading-6 text-[#756e64]">{item.description}</p>
        <div className="mt-auto flex items-center justify-between border-t border-[#dcd2c3]/70 pt-4 text-[10px] text-[#756e64]">
          <span>{new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "short" }).format(new Date(item.createdAt))}</span>
          <span className="flex items-center gap-3">
            {item.kind === "video" ? <span className="flex items-center gap-1"><PlayIcon width={12} height={12} /> Video</span> : null}
            <span className="flex items-center gap-1"><MessageIcon width={12} height={12} /> {item.commentCount || 0}</span>
            <ArrowUpRight width={13} height={13} />
          </span>
        </div>
      </div>
    </article>
  );
}
