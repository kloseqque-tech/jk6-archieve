import { ArticleDetail } from "@/components/article-detail";

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ArticleDetail id={slug} />;
}
