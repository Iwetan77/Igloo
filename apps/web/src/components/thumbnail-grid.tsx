"use client";

import Link from "next/link";
import type { FeedPost } from "@/lib/types";

export function ThumbnailGrid({ posts, className = "profile-video-grid" }: { posts: FeedPost[]; className?: string }) {
  return <div className={className}>{posts.map((post) => <Link key={post.id} href={"/post/" + encodeURIComponent(post.id)} aria-label={post.caption || post.market.question || "Watch video"}>
    <video src={post.video_url} muted playsInline preload="metadata" aria-hidden="true" onLoadedMetadata={(event) => {
      const video = event.currentTarget;
      if (Number.isFinite(video.duration) && video.duration > 0.1) video.currentTime = 0.1;
    }} />
    <span>{post.caption || post.market.question || "Watch video"}</span>
  </Link>)}</div>;
}
