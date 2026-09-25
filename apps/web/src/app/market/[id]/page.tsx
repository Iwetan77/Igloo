import { FeedExperience } from "@/components/feed-experience";

export default async function MarketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FeedExperience initialMarketId={id} />;
}
