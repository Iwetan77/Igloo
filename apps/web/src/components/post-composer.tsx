"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, Film, Upload, X } from "lucide-react";
import { createPost, requestVideoUpload } from "@/lib/api";
import { errorCopy } from "@/lib/copy";
import { categoryFor } from "@/lib/categories";
import { getSupabase, VIDEO_BUCKET } from "@/lib/supabase";
import { ProfileAvatar, authorName } from "@/components/profile-avatar";
import type { FeedPost, MarketSummary } from "@/lib/types";
import type { Session } from "@/lib/use-session";
import { useDirection, useIndicator } from "@/lib/motion";
import "@/styles/composer.css";

const CAPTION_LIMIT = 500;

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

type Step = "media" | "caption" | "publishing";

/** Record or upload, add a caption, publish. Quotes skip the market and inherit the original's. */
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
  const [mode, setMode] = useState<"record" | "upload">("record");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const marketId = market?.panta_market_id || "";
  const [caption, setCaption] = useState("");
  const [step, setStep] = useState<Step>("media");
  const [stage, setStage] = useState<"upload" | "post">("upload");
  const [error, setError] = useState("");
  const busy = step === "publishing";
  const modes = useIndicator<HTMLDivElement>(mode + step);
  const stepDirection = useDirection(["media", "caption", "publishing"].indexOf(step));

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function choose(candidate?: File) {
    if (!candidate) return;
    setError("");
    if (candidate.size > 50 * 1024 * 1024) { setError("Videos must be 50 MB or smaller."); return; }
    if (!["video/mp4", "video/webm", "video/quicktime"].includes(candidate.type)) { setError("Choose a video file."); return; }
    try {
      const duration = await durationOf(candidate);
      if (!Number.isFinite(duration) || duration > 60) { setError("Videos must be 60 seconds or shorter."); return; }
      setFile(candidate);
      setPreview(URL.createObjectURL(candidate));
    } catch {
      setError("This video could not be read.");
    }
  }

  async function publish() {
    if (!file || (!quotePost && !marketId.trim()) || busy) return;
    if (!session.authenticated) { session.login(); return; }
    const supabase = getSupabase();
    if (!supabase) { setError("Video storage is not configured."); return; }
    setStep("publishing");
    setStage("upload");
    setError("");
    try {
      const signed = await session.authorized((token) => requestVideoUpload(file.type, token));
      const upload = await supabase.storage.from(VIDEO_BUCKET).uploadToSignedUrl(signed.path, signed.token, file, { contentType: file.type });
      if (upload.error) throw upload.error;
      setStage("post");
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
      setStep("caption");
      setError(cause instanceof Error && "code" in cause ? errorCopy(cause) : cause instanceof Error ? cause.message : "Video upload failed. Please try again.");
    }
  }

  const topic = quotePost ? quotePost.market.question || quotePost.caption || "Quoted post" : market?.question || marketId;
  const head = (title: string, back?: () => void) => <div className="sheet-head">{back ? <button type="button" className="icon-btn sm" onClick={back} aria-label="Back"><ArrowLeft size={17} strokeWidth={1.5} /></button> : <span className="head-spacer" />}<h2 className="composer-title">{title}</h2><button type="button" className="icon-btn sm" onClick={onClose} disabled={busy} aria-label="Close" title="Close"><X size={17} strokeWidth={1.5} /></button></div>;

  return <div className="overlay composer-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="sheet composer-sheet" role="dialog" aria-modal="true" aria-label={quotePost ? "Quote post" : "Create post"}>
      <input ref={fileInput} className="visually-hidden" type="file" accept="video/*" tabIndex={-1} onChange={(event) => { void choose(event.target.files?.[0]); }} />
      <input ref={cameraInput} className="visually-hidden" type="file" accept="video/*" capture="environment" tabIndex={-1} onChange={(event) => { void choose(event.target.files?.[0]); }} />

      <div className={"step-body " + stepDirection} key={step}>
      {step === "media" && <>
        {head(quotePost ? "Quote this take" : "Your take")}
        <div className="capture-stage">
          {preview ? <video src={preview} muted playsInline controls className="capture-preview" /> : <div className="capture-empty"><Film size={30} strokeWidth={1.2} /><span className="label">Up to 60 seconds</span><p>{topic}</p></div>}
        </div>
        <div className="segmented capture-modes" ref={modes.host}><span className="indicator" ref={modes.bar} aria-hidden="true" /><button type="button" className={mode === "record" ? "active" : ""} onClick={() => setMode("record")}>Record</button><button type="button" className={mode === "upload" ? "active" : ""} onClick={() => setMode("upload")}>Upload</button></div>
        <div className="capture-controls">
          <span />
          <button type="button" className="shutter" onClick={() => (mode === "record" ? cameraInput : fileInput).current?.click()} aria-label={mode === "record" ? "Record a video" : "Upload a video"}>{mode === "record" ? <Camera size={24} strokeWidth={1.5} /> : <Upload size={24} strokeWidth={1.5} />}</button>
          <button type="button" className="btn btn-primary" disabled={!file} onClick={() => setStep("caption")}>Next</button>
        </div>
        {error && <p className="inline-error" role="alert">{error}</p>}
      </>}

      {step === "caption" && <>
        {head("Caption", () => setStep("media"))}
        {quotePost ? <div className="quote-source"><video src={quotePost.video_url} muted playsInline preload="metadata" aria-hidden="true" /><div><span className="label">Quoting</span><strong><ProfileAvatar src={quotePost.author.avatar_url} name={quotePost.author.display_name} size={20} />{authorName(quotePost.author)}</strong><p>{topic}</p></div></div>
          : <div className="card card-pad link-market"><span className="label live-dot">Linking take to market</span><strong>{topic}</strong></div>}
        <label className="visually-hidden" htmlFor="caption">Caption</label>
        <textarea id="caption" className="textarea" rows={5} maxLength={CAPTION_LIMIT} value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="What's your take? Back your prediction with some alpha…" />
        <p className="caption-count label">{CAPTION_LIMIT - caption.length} characters remaining</p>
        {error && <p className="inline-error" role="alert">{error}</p>}
        <button type="button" className="btn btn-primary btn-lg btn-block" disabled={!file || (!quotePost && !marketId.trim())} onClick={() => { void publish(); }}>{quotePost ? "Publish quote" : "Publish video"}</button>
      </>}

      {step === "publishing" && <>
        {head("Publishing")}
        <div className="publish-state">
          {preview && <video src={preview} muted playsInline autoPlay loop className="publish-thumb" />}
          {!quotePost && market && <span className="tag"># {categoryFor(market.category).label}</span>}
          <div className="publish-bar" aria-hidden="true"><span className={stage === "post" ? "almost" : ""} /></div>
          <p className="label" role="status">{stage === "upload" ? "Uploading video" : "Publishing your take"}</p>
        </div>
      </>}
      </div>
    </section>
  </div>;
}
