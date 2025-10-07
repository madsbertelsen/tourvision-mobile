'use dom';

import React, { useState, useMemo, useEffect, forwardRef, useImperativeHandle } from 'react';
import { ProseMirror } from '@nytimes/react-prosemirror';
import { EditorState } from 'prosemirror-state';
import { Schema, Node as ProseMirrorNode, DOMParser as ProseMirrorDOMParser } from 'prosemirror-model';
import { schema } from '@/utils/prosemirror-schema';
import { Decoration, DecorationSet } from 'prosemirror-view';
import './prosemirror-viewer-styles.css';

interface ProseMirrorViewerProps {
  content?: any; // ProseMirror JSON document
  onNodeFocus?: (nodeId: string | null) => void;
  focusedNodeId?: string | null;
}

export interface ProseMirrorViewerRef {
  scrollToNode: (nodeId: string) => void;
  getState: () => EditorState;
}

const ProseMirrorViewer = forwardRef<ProseMirrorViewerRef, ProseMirrorViewerProps>((
  {
    content,
    onNodeFocus,
    focusedNodeId
  },
  ref
) => {
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const [container, setContainer] = useState<HTMLElement | null>(null);

  // Convert JSON content to ProseMirror document
  const initialDoc = useMemo(() => {
    if (!content) {
      return schema.node('doc', null, [
        schema.node('paragraph', { id: 'empty-1' }, [])
      ]);
    }

    try {
      // If it's already a ProseMirror Node, use it directly
      if (content._type) {
        return content;
      }

      // Otherwise parse from JSON
      return schema.nodeFromJSON(content);
    } catch (error) {
      console.error('Error parsing ProseMirror content:', error);
      return schema.node('doc', null, [
        schema.node('paragraph', { id: 'error-1' }, [schema.text('Error loading content')])
      ]);
    }
  }, [content]);

  // Create editor state (read-only)
  const [state] = useState(() => {
    return EditorState.create({
      doc: initialDoc,
      schema
    });
  });

  // Update state when content changes
  useEffect(() => {
    if (!content) return;

    try {
      const newDoc = content._type ? content : schema.nodeFromJSON(content);
      // For now, we'll keep the state immutable since it's read-only
      // In the future, we can update it if needed
    } catch (error) {
      console.error('Error updating content:', error);
    }
  }, [content]);

  // Handle scroll-based focus detection
  useEffect(() => {
    if (!container || !mount) return;

    const handleScroll = () => {
      const containerRect = container.getBoundingClientRect();
      const threshold = 150; // pixels from top

      let focusedId: string | null = null;
      let minDistance = Infinity;

      // Find the node closest to the threshold
      state.doc.descendants((node, pos) => {
        if (node.attrs?.id) {
          // Find the DOM element for this node
          const domNode = mount.querySelector(`[data-node-id="${node.attrs.id}"]`);
          if (domNode) {
            const rect = domNode.getBoundingClientRect();
            const distance = Math.abs((rect.top - containerRect.top) - threshold);

            if (distance < minDistance && rect.top - containerRect.top <= threshold && rect.bottom - containerRect.top > threshold) {
              minDistance = distance;
              focusedId = node.attrs.id;
            }
          }
        }
      });

      if (onNodeFocus && focusedId !== focusedNodeId) {
        onNodeFocus(focusedId);
      }
    };

    // Attach listener to the scrolling container
    container.addEventListener('scroll', handleScroll);

    // Call once on mount to set initial focus
    handleScroll();

    return () => container.removeEventListener('scroll', handleScroll);
  }, [container, mount, state, onNodeFocus, focusedNodeId]);

  // Apply focus styling based on focusedNodeId
  useEffect(() => {
    if (!mount || !focusedNodeId) return;

    // Remove all focus classes
    mount.querySelectorAll('.pm-node-focused').forEach(el => {
      el.classList.remove('pm-node-focused');
    });

    // Add focus class to the focused node
    const focusedElement = mount.querySelector(`[data-node-id="${focusedNodeId}"]`);
    if (focusedElement) {
      focusedElement.classList.add('pm-node-focused');
    }
  }, [mount, focusedNodeId]);

  // Scroll to a specific node
  const scrollToNode = (nodeId: string) => {
    if (!mount || !container) return;

    const element = mount.querySelector(`[data-node-id="${nodeId}"]`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  // Get current state
  const getState = () => state;

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    scrollToNode,
    getState
  }));

  // Custom node views to add data attributes
  const nodeViews = useMemo(() => {
    const views: any = {};

    // Add data-node-id to all block nodes
    ['paragraph', 'heading', 'blockquote'].forEach(nodeType => {
      views[nodeType] = (node: ProseMirrorNode) => {
        const dom = document.createElement(
          nodeType === 'heading' ? `h${node.attrs.level || 2}` :
          nodeType === 'blockquote' ? 'blockquote' : 'p'
        );

        if (node.attrs?.id) {
          dom.setAttribute('data-node-id', node.attrs.id);
        }

        // Add classes for styling
        dom.className = `pm-${nodeType}`;

        return { dom, contentDOM: dom };
      };
    });

    // Custom rendering for geo-marks
    views['geoMark'] = (node: ProseMirrorNode) => {
      const span = document.createElement('span');
      span.className = 'pm-geo-mark';

      if (node.attrs?.geoId) {
        span.setAttribute('data-geo-id', node.attrs.geoId);
      }

      // Color assignment based on attributes
      const colorIndex = node.attrs?.colorIndex || 0;
      const colors = [
        '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444',
        '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
      ];
      span.style.backgroundColor = `${colors[colorIndex % colors.length]}33`;
      span.style.borderBottom = `2px solid ${colors[colorIndex % colors.length]}`;

      span.title = node.attrs?.placeName || 'Location';

      return { dom: span, contentDOM: span };
    };

    return views;
  }, []);

  return (
    <div ref={setContainer} className="prosemirror-viewer-container">
      <ProseMirror
        mount={mount}
        state={state}
        nodeViews={nodeViews}
        editable={() => false}
      >
        <div
          ref={setMount}
          className="prosemirror-viewer"
        />
      </ProseMirror>
    </div>
  );
});

ProseMirrorViewer.displayName = 'ProseMirrorViewer';

export default ProseMirrorViewer;