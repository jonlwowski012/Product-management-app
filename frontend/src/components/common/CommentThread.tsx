import { useState } from 'react';
import type { Comment } from '../../types';

interface CommentThreadProps {
  comments: Comment[];
  onAdd: (content: string) => void;
}

export default function CommentThread({ comments, onAdd }: CommentThreadProps) {
  const [text, setText] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onAdd(text.trim());
    setText('');
  };

  return (
    <div className="space-y-3">
      {comments.length === 0 && (
        <p className="text-sm text-gray-400 italic">No comments yet</p>
      )}
      {comments.map((c) => (
        <div key={c.id} className="bg-gray-50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-gray-900">{c.userName}</span>
            <span className="text-xs text-gray-400">
              {new Date(c.createdAt).toLocaleDateString()}
            </span>
          </div>
          <p className="text-sm text-gray-700">{c.content}</p>
        </div>
      ))}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a comment..."
          className="input flex-1"
        />
        <button type="submit" className="btn-primary text-sm">
          Post
        </button>
      </form>
    </div>
  );
}
