import { MediaDetail } from "@/components/media-detail";

export default async function PhotoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MediaDetail id={id} />;
}
