import { useState } from "react";
import type { ApiComment } from "@/types";

type Props = {
  comments: ApiComment[];
  canPost: boolean;
  onSubmit: (body: string) => void;
  isSubmitting?: boolean;
  error?: string | null;
};

export function CommentList({ comments, canPost, onSubmit, isSubmitting, error }: Props) {
  const [body, setBody] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setBody("");
  }

  return (
    <div>
      <h3 className="text-xs text-muted mb-2">comments</h3>

      {comments.length === 0 ? (
        <p className="text-xs text-muted italic mb-3">no comments yet</p>
      ) : (
        <ul className="space-y-2 mb-3 max-h-48 overflow-y-auto">
          {comments.map((c) => (
            <li key={c.id} className="bg-bg border border-border rounded-md p-2 text-sm">
              <div className="flex items-center justify-between text-xs text-muted mb-1">
                <span className="font-medium text-white">{c.author.name}</span>
                <span>{new Date(c.created_at).toLocaleString()}</span>
              </div>
              <p className="whitespace-pre-wrap">{c.body}</p>
            </li>
          ))}
        </ul>
      )}

      {canPost && (
        <form onSubmit={handleSubmit} className="flex gap-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="add a comment"
            rows={2}
            className="flex-1 rounded-md bg-bg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none"
          />
          <button
            type="submit"
            disabled={isSubmitting || !body.trim()}
            className="bg-accent hover:bg-indigo-500 text-white text-sm font-medium rounded-md px-4 disabled:opacity-50"
          >
            post
          </button>
        </form>
      )}

      {error && (
        <p className="text-sm text-red-400 mt-2" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
