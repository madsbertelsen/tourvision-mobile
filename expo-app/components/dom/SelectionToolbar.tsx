'use dom';

import React, { useEffect, useState, useRef } from 'react';
import './selection-toolbar.css';

interface SelectionToolbarProps {
  selection: {
    from: number;
    to: number;
    text: string;
  } | null;
  editorView: any;
  onSuggestChange?: (selectedText: string, suggestion: string) => void;
  onAddComment?: (selectedText: string, comment: string) => void;
}

export function SelectionToolbar({
  selection,
  editorView,
  onSuggestChange,
  onAddComment
}: SelectionToolbarProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [showCommentInput, setShowCommentInput] = useState(false);
  const [commentText, setCommentText] = useState('');
  const toolbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selection || !editorView || selection.from === selection.to) {
      setIsVisible(false);
      setShowCommentInput(false);
      return;
    }

    // Get the coordinates of the selection
    const coords = editorView.coordsAtPos(selection.from);
    const endCoords = editorView.coordsAtPos(selection.to);

    // Calculate toolbar position
    const editorRect = editorView.dom.getBoundingClientRect();
    const top = coords.top - editorRect.top - 40; // Position above selection
    const left = (coords.left + endCoords.right) / 2 - editorRect.left - 100; // Center horizontally

    setPosition({ top, left });
    setIsVisible(true);
  }, [selection, editorView]);

  const handleSuggestChange = () => {
    setShowCommentInput(true);
  };

  const handleSubmitComment = () => {
    if (commentText.trim() && selection) {
      if (onSuggestChange) {
        onSuggestChange(selection.text, commentText);
      }
      setCommentText('');
      setShowCommentInput(false);
      setIsVisible(false);
    }
  };

  const handleCancel = () => {
    setCommentText('');
    setShowCommentInput(false);
  };

  if (!isVisible) return null;

  return (
    <div
      ref={toolbarRef}
      className="selection-toolbar"
      style={{
        position: 'absolute',
        top: `${position.top}px`,
        left: `${position.left}px`,
        zIndex: 1000,
      }}
    >
      {!showCommentInput ? (
        <div className="selection-toolbar-buttons">
          <button
            className="selection-toolbar-button"
            onClick={handleSuggestChange}
            title="Suggest a change"
          >
            💭 Suggest Change
          </button>
        </div>
      ) : (
        <div className="selection-comment-input">
          <textarea
            className="selection-comment-textarea"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Describe your change (e.g., 'Stay overnight in Roskilde instead')"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmitComment();
              }
              if (e.key === 'Escape') {
                handleCancel();
              }
            }}
          />
          <div className="selection-comment-actions">
            <button
              className="selection-comment-submit"
              onClick={handleSubmitComment}
              disabled={!commentText.trim()}
            >
              Submit
            </button>
            <button
              className="selection-comment-cancel"
              onClick={handleCancel}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}