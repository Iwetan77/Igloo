"use client";

import { useRef, useState } from "react";
import { Camera, Upload, X } from "lucide-react";
import { createPost, requestVideoUpload } from "@/lib/api";
import { errorCopy } from "@/lib/copy";
import { getSupabase, VIDEO_BUCKET } from "@/lib/supabase";
import { ProfileAvatar, authorName } from "@/components/profile-avatar";
import type { FeedPost, MarketSummary } from "@/lib/types";
import type { Session } from "@/lib/use-session";
import "@/styles/composer.css";

async function durationOf(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    const cleanup = () => { URL.revokeObjectURL(url); video.removeAttribute("src"); video.load(); };
    video.preload = "metadata";
    video.onloadedmetadata = () => { const duration = video.duration; cleanup(); resolve(duration); };
    video.onerror = () => { cleanup(); reject(new Error("This video could not be read.")); };
    video.src = url;
  });
}

export function PostComposer({
  market, quotePost, session, onClose, onPosted,
}: {
  market?: MarketSummary | null;
  quotePost?: FeedPost | null;
  session: Session;
  onClose: () => void;
  onPosted: (id: string) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const marketId = market?.panta_market_id || "";
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function choose(candidate?: File) {
    if (!candidate) return;
    setError("");
    if (candidate.size > 50 * 1024 * 1024) {
      setError("Videos must be 50 MB or smaller.");
      return;
    }
    if (!["video/mp4", "video/webm", "video/quicktime"].includes(candidate.type)) {
      setError("Choose a video file.");
      return;
    }
    try {
      const duration = await durationOf(candidate);
      if (!Number.isFinite(duration) || duration > 60) {
        setError("Videos must be 60 seconds or shorter.");
        return;
      }
      if (preview) URL.revokeObjectURL(preview);
      setFile(candidate);
      setPreview(URL.createObjectURL(candidate));
    } catch {
      setError("This video could not be read.");
    }
  }

  async function publish(event: React.FormEvent) {
    event.preventDefault();
    if (!file || (!quotePost && !marketId.trim()) || busy) return;
    if (!session.authenticated) {
      session.login();
      return;
    }
    const supabase = getSupabase();
    if (!supabase) {
      setError("Video storage is not configured.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const signed = await session.authorized((token) => requestVideoUpload(file.type, token));
      const upload = await supabase.storage.from(VIDEO_BUCKET).uploadToSignedUrl(signed.path, signed.token, file, { contentType: file.type });
      if (upload.error) throw upload.error;
      const post = await session.authorized((token) => createPost(quotePost ? {
        quoted_post_id: quotePost.id,
        video_url: signed.public_url,
        caption: caption.trim() || undefined,
      } : {
        panta_market_id: marketId.trim(),
        video_url: signed.public_url,
        caption: caption.trim() || undefined,
      }, token));
      onPosted(post.id);
    } catch (cause) {
      setError(errorCopy(cause));
      if (!(cause instanceof Error && "code" in cause)) {
        setError(cause instanceof Error ? cause.message : "Video upload failed. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose();
    }}>
      <section className="sheet composer-sheet" role="dialog" aria-modal="true" aria-label={quotePost ? "Quote post" : "Create post"}>
        <div className="sheet-head"><div><span className="eyebrow">{quotePost ? "Quote" : "New post"}</span><h2>{quotePost ? "Quote this post" : "Post a video"}</h2></div><button type="button" className="icon-action" onClick={onClose} disabled={busy} aria-label="Close post composer" title="Close"><X size={20} /></button></div>
        <form onSubmit={publish}>
          {quotePost && <div className="quote-source"><video src={quotePost.video_url} muted playsInline preload="auto" aria-hidden="true" /><div><span>Original post</span><strong><ProfileAvatar src={quotePost.author.avatar_url} name={quotePost.author.display_name} size={22} />{authorName(quotePost.author)}</strong><p>{quotePost.market.question || quotePost.caption || "Market post"}</p>{quotePost.caption && quotePost.caption !== quotePost.market.question && <small>{quotePost.caption}</small>}</div></div>}
          <div className="upload-area">
            {preview ? <video src={preview} muted playsInline controls className="preview-video" /> : <div className="upload-placeholder"><Upload size={30} /><span>Choose a video, up to 60 seconds</span></div>}
            <div className="upload-actions">
              <button type="button" className="subtle-button" onClick={() => fileInput.current?.click()}><Upload size={16} />Upload</button>
              <button type="button" className="subtle-button" onClick={() => cameraInput.current?.click()}><Camera size={16} />Record</button>
            </div>
            <input ref={fileInput} className="hidden-input" type="file" accept="video/*" onChange={(event) => { void choose(event.target.files?.[0]); }} />
            <input ref={cameraInput} className="hidden-input" type="file" accept="video/*" capture="environment" onChange={(event) => { void choose(event.target.files?.[0]); }} />
          </div>
          {!quotePost && market && <div className="composer-market"><span>Posting on {market.category || "market"}</span><strong>{market.question || market.panta_market_id}</strong></div>}
          <label className="field-label" htmlFor="caption">Caption</label>
          <textarea id="caption" className="text-field" rows={3} maxLength={500} value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="What's your take?" />
          {error && <p className="inline-error" role="alert">{error}</p>}
          <button type="submit" className="solid-action" disabled={busy || !file || (!quotePost && !marketId.trim())}>{busy ? "Publishing..." : quotePost ? "Publish quote" : "Publish video"}</button>
        </form>
      </section>
    </div>
  );
}
