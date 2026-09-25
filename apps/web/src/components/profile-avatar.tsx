import Image from "next/image";
import { UserRound } from "lucide-react";
import type { Author } from "@/lib/types";

export function authorName(author: Pick<Author, "username" | "display_name">) {
  return author.username ? "@" + author.username : author.display_name || "Igloo member";
}

export function ProfileAvatar({ src, name, size = 40, className = "" }: { src?: string | null; name?: string | null; size?: number; className?: string }) {
  return <span className={"profile-avatar " + className} style={{ width: size, height: size }}>
    {src ? <Image src={src} alt={name || "Profile avatar"} width={size} height={size} unoptimized /> : <UserRound size={Math.round(size * 0.54)} aria-hidden="true" />}
  </span>;
}
