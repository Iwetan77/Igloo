"use client";

import { useCallback, useEffect, useState } from "react";
import { Send, X } from "lucide-react";
import { createComment, getComments } from "@/lib/api";
import { errorCopy, uiCopy } from "@/lib/copy";
import { getSupabase } from "@/lib/supabase";
import { ProfileAvatar, authorName } from "@/components/profile-avatar";
import type { Comment, FeedPost } from "@/lib/types";
import type { Session } from "@/lib/use-session";

export function CommentsDrawer({
  post, session, onClose, onAdded,
}: {
  post: FeedPost;
  session: Session;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const result = await getComments(post.id);
      setComments(result.comments);
      setError("");
    } catch (cause) {
      setError(errorCopy(cause));
    } finally {
      setLoading(false);
    }
  }, [post.id]);

  useEffect(() => {
    if (post.demo) {
      setLoading(false);
      return;
    }
    void refresh();
    const supabase = getSupabase();
    if (!supabase) return;
    const channel = supabase.channel("comments:" + post.id)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "comments", filter: "post_id=eq." + post.id,
      }, () => { void refresh(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [post.id, post.demo, refresh]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!body.trim() || sending) return;
    if (!session.authenticated) {
      session.login();
      return;
    }
    setSending(true);
    setError("");
    try {
      const created = await session.authorized((token) => createComment(post.id, body.trim(), token));
      setComments((current) => current.some((item) => item.id === created.id) ? current : [...current, created]);
      setBody("");
      onAdded();
    } catch (cause) {
      setError(errorCopy(cause));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="sheet comments-sheet" role="dialog" aria-modal="true" aria-label="Comments">
        <div className="sheet-head"><div><span className="eyebrow">Conversation</span><h2>Comments {post.comment_count > 0 ? "(" + post.comment_count + ")" : ""}</h2></div><button className="icon-action" type="button" onClick={onClose} aria-label="Close comments" title="Close"><X size={20} /></button></div>
        <div className="comment-list">
          {post.demo ? <p className="empty-note">Demo posts have no conversation. Add your own video to start one.</p> :
            loading ? <p className="empty-note">Loading comments...</p> :
            comments.length === 0 ? <p className="empty-note">{uiCopy("comments.empty")}</p> :
            comments.map((comment) => (
              <article className="comment" key={comment.id}>
                <ProfileAvatar src={comment.author.avatar_url} name={comment.author.display_name} size={34} />
                <div><div className="comment-meta"><strong>{authorName(comment.author)}</strong><time dateTime={comment.created_at}>{new Date(comment.created_at).toLocaleDateString()}</time></div><p>{comment.body}</p></div>
              </article>
            ))}
        </div>
        {!post.demo && <form className="comment-form" onSubmit={send}>
          {error && <p className="inline-error" role="alert">{error}</p>}
          <div className="comment-entry"><input aria-label="Add a comment" placeholder={uiCopy("comment.placeholder")} value={body} maxLength={2000} onChange={(event) => setBody(event.target.value)} /><button type="submit" className="send-button" disabled={!body.trim() || sending} aria-label="Send comment" title="Send"><Send size={19} /></button></div>
        </form>}
      </section>
    </div>
  );
}
