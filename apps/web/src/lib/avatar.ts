import { requestAvatarUpload } from "@/lib/api";
import { getSupabase } from "@/lib/supabase";
import type { Session } from "@/lib/use-session";

/** Validates, uploads to the signed avatars URL, and saves it on the profile. */
export async function uploadAvatar(session: Session, file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Choose a JPEG, PNG, or WebP image.");
  if (file.size > 2 * 1024 * 1024) throw new Error("Avatar must be 2 MB or smaller.");
  const supabase = getSupabase();
  if (!supabase) throw new Error("Avatar storage is unavailable.");
  const signed = await session.authorized((token) => requestAvatarUpload(file.type, token));
  const { error } = await supabase.storage.from("avatars").uploadToSignedUrl(signed.path, signed.token, file);
  if (error) throw error;
  return session.updateProfile({ avatar_url: signed.public_url });
}
