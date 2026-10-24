import { Suspense } from "react";
import { ArchiveCollection } from "@/components/archive-collection";

export const metadata = {
  title: "Photographs",
  description: "The photographic archive of Joshua Kimmich, including reviewed community uploads.",
};

export default function PhotosPage() {
  return (
    <Suspense fallback={<div className="page-wrap min-h-[60vh] py-20 text-sm text-[#756e64]">Opening photograph collection…</div>}>
      <ArchiveCollection fixedKind="image" />
    </Suspense>
  );
}
