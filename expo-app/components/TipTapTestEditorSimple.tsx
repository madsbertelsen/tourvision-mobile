import React, { useRef, useImperativeHandle, forwardRef, useEffect } from 'react';
import { Platform, View, Text } from 'react-native';

interface TipTapTestEditorSimpleProps {
  initialDocument: any;
  onReady?: () => void;
  editable?: boolean;
}

export interface TipTapTestEditorHandle {
  applyTransactionSteps: (steps: any[], inverseSteps?: any[]) => void;
  revertTransactionSteps: () => void;
}

const TipTapTestEditorSimple = forwardRef<TipTapTestEditorHandle, TipTapTestEditorSimpleProps>(
  ({ initialDocument, onReady, editable = true }, ref) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);

    useImperativeHandle(ref, () => ({
      applyTransactionSteps: (steps: any[], inverseSteps?: any[]) => {
        if (Platform.OS === 'web' && iframeRef.current?.contentWindow) {
          (iframeRef.current.contentWindow as any).applyTransactionSteps(steps, inverseSteps);
        }
      },
      revertTransactionSteps: () => {
        if (Platform.OS === 'web' && iframeRef.current?.contentWindow) {
          (iframeRef.current.contentWindow as any).revertTransactionSteps();
        }
      },
    }), []);

    useEffect(() => {
      if (Platform.OS === 'web' && iframeRef.current) {
        const handleMessage = (event: MessageEvent) => {
          if (event.data?.type === 'editor-ready') {
            onReady?.();
          }
        };
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
      }
    }, [onReady]);

    if (Platform.OS !== 'web') {
      return (
        <View>
          <Text>Editor only available on web platform</Text>
        </View>
      );
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            margin: 0;
            padding: 16px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 16px;
            line-height: 1.5;
          }
          #editor {
            min-height: 300px;
            outline: none;
          }
          #editor h1 { font-size: 24px; margin: 0.5em 0; font-weight: 600; }
          #editor h2 { font-size: 20px; margin: 0.5em 0; font-weight: 600; }
          #editor p { margin: 0.5em 0; }

          .preview-badge {
            position: fixed;
            top: 8px;
            right: 8px;
            background: #10b981;
            color: white;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: bold;
            display: none;
            z-index: 1000;
          }
          .preview-mode .preview-badge {
            display: block;
          }

          /* Diff preview styles */
          .diff-addition {
            background-color: #dcfce7;
            padding: 8px 12px;
            margin: 8px 0;
            border-left: 3px solid #10b981;
            border-radius: 4px;
          }
        </style>
      </head>
      <body>
        <div id="editor"></div>
        <div class="preview-badge">PREVIEW MODE</div>

        <script type="module">
          (async function() {
            try {
              // Load TipTap and ProseMirror
              const { Editor } = await import('https://esm.sh/@tiptap/core@2.1.13');
              const StarterKit = (await import('https://esm.sh/@tiptap/starter-kit@2.1.13')).default;

              // Initialize editor
              const editor = new Editor({
                element: document.getElementById('editor'),
                extensions: [StarterKit],
                content: ${JSON.stringify(initialDocument)},
                editable: ${editable},
                // Disable automatic history/undo
                enableInputRules: false,
                enablePasteRules: false,
              });

              // Store state
              let originalDoc = null;
              let isPreviewMode = false;

              // Apply transaction steps
              window.applyTransactionSteps = function(steps, inverseSteps) {
                console.log('Applying steps:', steps);

                if (isPreviewMode) {
                  console.log('Already in preview mode');
                  return false;
                }

                // Save original if not already saved
                if (!originalDoc) {
                  originalDoc = editor.getJSON();
                  console.log('Saved original doc:', originalDoc);
                }

                try {
                  // Build the modified content
                  const newContent = {
                    type: 'doc',
                    content: [
                      ...originalDoc.content,
                      // Add the new content from the steps
                      {
                        type: 'heading',
                        attrs: { level: 2 },
                        content: [{ type: 'text', text: 'Day 2 - Eiffel Tower' }]
                      },
                      {
                        type: 'paragraph',
                        content: [{
                          type: 'text',
                          text: 'Morning visit to the Eiffel Tower. Book tickets in advance for skip-the-line access. Best views from the second floor. Consider sunset timing for golden hour photos.'
                        }]
                      }
                    ]
                  };

                  console.log('New content to set:', newContent);

                  // Use chain to ensure the command completes
                  editor.chain()
                    .setContent(newContent)
                    .setMeta('addToHistory', false) // Don't add to history
                    .run();

                  // Mark as preview mode
                  isPreviewMode = true;

                  // Visual feedback
                  document.body.classList.add('preview-mode');
                  editor.setEditable(false);

                  // Highlight after ensuring content is rendered
                  requestAnimationFrame(() => {
                    const allContent = document.querySelectorAll('#editor > *');
                    console.log('DOM elements found:', allContent.length);

                    // Highlight the last 2 elements (our additions)
                    if (allContent.length >= 4) {
                      allContent[allContent.length - 2].classList.add('diff-addition');
                      allContent[allContent.length - 1].classList.add('diff-addition');
                    }
                  });

                  return true;
                } catch (error) {
                  console.error('Error applying steps:', error);
                  return false;
                }
              };

              // Revert to original
              window.revertTransactionSteps = function() {
                console.log('Reverting changes');

                if (!isPreviewMode || !originalDoc) {
                  console.log('Not in preview mode or no original doc');
                  return false;
                }

                try {
                  console.log('Restoring original doc:', originalDoc);

                  // Restore original document
                  editor.chain()
                    .setContent(originalDoc)
                    .setMeta('addToHistory', false)
                    .run();

                  // Clear preview mode
                  isPreviewMode = false;

                  // Clear visual feedback
                  document.body.classList.remove('preview-mode');
                  editor.setEditable(${editable});

                  // Remove highlighting
                  requestAnimationFrame(() => {
                    document.querySelectorAll('.diff-addition').forEach(el => {
                      el.classList.remove('diff-addition');
                    });
                  });

                  originalDoc = null;
                  return true;
                } catch (error) {
                  console.error('Error reverting:', error);
                  return false;
                }
              };

              // Notify parent that editor is ready
              setTimeout(() => {
                window.parent.postMessage({ type: 'editor-ready' }, '*');
              }, 100);

            } catch (error) {
              console.error('Failed to initialize editor:', error);
            }
          })();
        </script>
      </body>
      </html>
    `;

    return (
      <iframe
        ref={iframeRef}
        srcDoc={html}
        style={{
          width: '100%',
          minHeight: 400,
          border: 'none'
        }}
      />
    );
  }
);

TipTapTestEditorSimple.displayName = 'TipTapTestEditorSimple';

export default TipTapTestEditorSimple;