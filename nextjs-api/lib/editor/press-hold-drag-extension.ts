import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { NodeSelection } from '@tiptap/pm/state';

export interface PressHoldDragOptions {
  holdDuration?: number; // Duration in ms before drag starts
  threshold?: number; // Movement threshold to cancel hold
}

/**
 * Extension that enables press-and-hold to initiate dragging
 */
export const PressHoldDrag = Extension.create<PressHoldDragOptions>({
  name: 'pressHoldDrag',

  addOptions() {
    return {
      holdDuration: 500, // 500ms hold to start dragging
      threshold: 5, // 5px movement threshold
    };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    
    return [
      new Plugin({
        key: new PluginKey('pressHoldDrag'),
        props: {
          handleDOMEvents: {
            mousedown: (view, event) => {
              const target = event.target as HTMLElement;
              
              // Skip if clicking on interactive elements
              if (
                target.tagName === 'BUTTON' ||
                target.tagName === 'A' ||
                target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.tagName === 'SUMMARY' ||
                target.closest('.drag-handle') ||
                target.closest('button') ||
                target.closest('a')
              ) {
                return false;
              }

              // Find the closest draggable node
              const draggableNode = target.closest('.draggable-node, .destination-node, .transportation-node');
              if (!draggableNode) {
                return false;
              }

              // Get the position of this node in the editor
              const pos = view.posAtDOM(draggableNode as HTMLElement, 0);
              if (pos === null) {
                return false;
              }

              // Get the node at this position
              const $pos = view.state.doc.resolve(pos);
              const node = $pos.nodeAfter || $pos.nodeBefore;
              
              if (!node || !node.type.spec.draggable) {
                return false;
              }

              // Store initial mouse position
              const startX = event.clientX;
              const startY = event.clientY;
              let holdTimer: NodeJS.Timeout | null = null;
              let isDragging = false;
              let dragStarted = false;

              // Visual feedback container
              const feedbackContainer = document.createElement('div');
              feedbackContainer.style.cssText = `
                position: fixed;
                left: ${startX}px;
                top: ${startY}px;
                width: 48px;
                height: 48px;
                margin-left: -24px;
                margin-top: -24px;
                pointer-events: none;
                z-index: 9999;
              `;

              // Progress ring for hold duration
              const progressRing = document.createElement('svg');
              progressRing.style.cssText = `
                position: absolute;
                width: 48px;
                height: 48px;
                transform: rotate(-90deg);
              `;
              progressRing.innerHTML = `
                <circle
                  cx="24"
                  cy="24"
                  r="20"
                  stroke="rgba(59, 130, 246, 0.2)"
                  stroke-width="3"
                  fill="none"
                />
                <circle
                  class="progress-ring-circle"
                  cx="24"
                  cy="24"
                  r="20"
                  stroke="#3b82f6"
                  stroke-width="3"
                  fill="none"
                  stroke-dasharray="125.6"
                  stroke-dashoffset="125.6"
                  style="transition: stroke-dashoffset ${options.holdDuration}ms linear;"
                />
              `;

              // Inner dot
              const innerDot = document.createElement('div');
              innerDot.style.cssText = `
                position: absolute;
                top: 50%;
                left: 50%;
                width: 12px;
                height: 12px;
                margin-left: -6px;
                margin-top: -6px;
                border-radius: 50%;
                background: #3b82f6;
                opacity: 0.8;
                animation: holdPulse 1s ease-in-out infinite;
              `;

              feedbackContainer.appendChild(progressRing);
              feedbackContainer.appendChild(innerDot);

              // Add CSS animation if not already present
              if (!document.querySelector('#press-hold-styles')) {
                const style = document.createElement('style');
                style.id = 'press-hold-styles';
                style.textContent = `
                  @keyframes holdPulse {
                    0%, 100% { transform: scale(1); opacity: 0.8; }
                    50% { transform: scale(1.2); opacity: 1; }
                  }
                  
                  @keyframes dragReady {
                    0% { transform: scale(1); }
                    100% { transform: scale(1.2); opacity: 0; }
                  }
                  
                  .press-hold-preparing {
                    opacity: 0.9 !important;
                    background: rgba(59, 130, 246, 0.05) !important;
                    outline: 2px solid rgba(59, 130, 246, 0.3) !important;
                    outline-offset: 2px !important;
                    transition: all 0.2s ease !important;
                  }
                  
                  .press-hold-dragging {
                    cursor: grabbing !important;
                    user-select: none !important;
                    opacity: 0.7 !important;
                    transform: scale(1.02) !important;
                    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2) !important;
                    outline: 2px solid #3b82f6 !important;
                    outline-offset: 2px !important;
                    z-index: 1000 !important;
                    position: relative !important;
                  }
                  
                  body.is-dragging * {
                    cursor: grabbing !important;
                  }
                `;
                document.head.appendChild(style);
              }

              const startDrag = () => {
                if (dragStarted) return;
                dragStarted = true;
                
                // Complete the progress ring animation
                const progressCircle = feedbackContainer.querySelector('.progress-ring-circle') as SVGCircleElement;
                if (progressCircle) {
                  progressCircle.style.strokeDashoffset = '0';
                }

                // Flash and fade out the feedback
                feedbackContainer.style.animation = 'dragReady 0.3s ease-out forwards';

                // Select the node
                const tr = view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos));
                view.dispatch(tr);

                // Add dragging class and body class
                draggableNode.classList.remove('press-hold-preparing');
                draggableNode.classList.add('press-hold-dragging');
                document.body.classList.add('is-dragging');
                
                // After feedback animation, initiate drag
                setTimeout(() => {
                  if (feedbackContainer.parentNode) {
                    feedbackContainer.remove();
                  }
                  
                  // Trigger drag start
                  const dragEvent = new DragEvent('dragstart', {
                    bubbles: true,
                    cancelable: true,
                    dataTransfer: new DataTransfer(),
                    clientX: startX,
                    clientY: startY,
                  });
                  
                  // Set draggable temporarily
                  const originalDraggable = (draggableNode as HTMLElement).draggable;
                  (draggableNode as HTMLElement).draggable = true;
                  
                  // Dispatch the drag event
                  draggableNode.dispatchEvent(dragEvent);
                  
                  // Restore original draggable state after a delay
                  setTimeout(() => {
                    (draggableNode as HTMLElement).draggable = originalDraggable;
                    draggableNode.classList.remove('press-hold-dragging');
                    document.body.classList.remove('is-dragging');
                  }, 100);
                  
                  isDragging = true;
                }, 300);
              };

              const cleanup = () => {
                if (holdTimer) {
                  clearTimeout(holdTimer);
                  holdTimer = null;
                }
                if (feedbackContainer.parentNode) {
                  feedbackContainer.remove();
                }
                draggableNode.classList.remove('press-hold-preparing');
                draggableNode.classList.remove('press-hold-dragging');
                document.body.classList.remove('is-dragging');
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
              };

              const handleMouseMove = (e: MouseEvent) => {
                // Check if mouse moved beyond threshold
                const dx = Math.abs(e.clientX - startX);
                const dy = Math.abs(e.clientY - startY);
                
                if (dx > options.threshold || dy > options.threshold) {
                  // Cancel hold if not dragging yet
                  if (!isDragging && holdTimer) {
                    cleanup();
                  }
                }
              };

              const handleMouseUp = () => {
                cleanup();
              };

              // Start visual feedback immediately
              draggableNode.classList.add('press-hold-preparing');
              document.body.appendChild(feedbackContainer);
              
              // Start the progress ring animation after a brief delay
              setTimeout(() => {
                const progressCircle = feedbackContainer.querySelector('.progress-ring-circle') as SVGCircleElement;
                if (progressCircle) {
                  progressCircle.style.strokeDashoffset = '0';
                }
              }, 50);

              // Start hold timer
              holdTimer = setTimeout(() => {
                startDrag();
              }, options.holdDuration);

              // Add event listeners
              document.addEventListener('mousemove', handleMouseMove);
              document.addEventListener('mouseup', handleMouseUp);

              return false; // Let default behavior continue
            },
          },
        },
      }),
    ];
  },
});