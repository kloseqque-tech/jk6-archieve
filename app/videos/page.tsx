import { Suspense } from "react";
import { ArchiveCollection } from "@/components/archive-collection";

export const metadata = {
  title: "Videos",
  description: "Uploaded video files and verified external moving-image records.",
};

export default function VideosPage() {
  return (
    <Suspense fallback={<div className="page-wrap min-h-[60vh] py-20 text-sm text-[#756e64]">Opening video archive…</div>}>
      <ArchiveCollection fixedKind="video" />
    </Suspense>
  );
}
