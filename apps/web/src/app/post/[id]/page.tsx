import { FeedExperience } from "@/components/feed-experience";

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FeedExperience initialPostId={id} />;
}
