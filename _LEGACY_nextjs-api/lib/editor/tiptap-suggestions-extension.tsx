import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as ProsemirrorNode } from '@tiptap/pm/model';
import type { Suggestion } from '@/lib/db/schema';
import { createRoot } from 'react-dom/client';
import { Suggestion as SuggestionComponent } from '@/components/suggestion';

export const suggestionsPluginKey = new PluginKey('suggestions');

export interface TipTapSuggestion extends Suggestion {
  selectionStart: number;
  selectionEnd: number;
}

interface Position {
  start: number;
  end: number;
}

function findPositionsInDoc(doc: ProsemirrorNode, searchText: string): Position | null {
  let positions: { start: number; end: number } | null = null;

  doc.nodesBetween(0, doc.content.size, (node, pos) => {
    if (node.isText && node.text) {
      const index = node.text.indexOf(searchText);

      if (index !== -1) {
        positions = {
          start: pos + index,
          end: pos + index + searchText.length,
        };

        return false;
      }
    }
    return true;
  });

  return positions;
}

export function projectWithPositions(
  doc: ProsemirrorNode,
  suggestions: Array<Suggestion>,
): Array<TipTapSuggestion> {
  return suggestions
    .map((suggestion) => {
      const positions = findPositionsInDoc(doc, suggestion.selectionText);
      if (!positions) return null;

      return {
        ...suggestion,
        selectionStart: positions.start,
        selectionEnd: positions.end,
      };
    })
    .filter((s): s is TipTapSuggestion => s !== null);
}

export function createSuggestionWidget(
  suggestion: TipTapSuggestion,
  sendSuggestionMessage: (suggestion: Suggestion) => void,
  artifactKind?: string,
) {
  const container = document.createElement('div');
  container.className = 'suggestion-widget';
  
  const root = createRoot(container);
  root.render(
    <SuggestionComponent
      suggestion={suggestion}
      onAccept={() => sendSuggestionMessage(suggestion)}
      artifactKind={artifactKind as any}
    />
  );

  return container;
}

export const createDecorations = (
  suggestions: Array<TipTapSuggestion>,
  sendSuggestionMessage?: (suggestion: Suggestion) => void,
  artifactKind?: string,
) => {
  const decorations: Array<Decoration> = [];

  suggestions.forEach((suggestion) => {
    if (!suggestion.selectionStart || !suggestion.selectionEnd) return;

    decorations.push(
      Decoration.inline(
        suggestion.selectionStart,
        suggestion.selectionEnd,
        { class: 'suggestion-highlight' },
      ),
    );

    if (sendSuggestionMessage) {
      const widget = createSuggestionWidget(
        suggestion,
        sendSuggestionMessage,
        artifactKind,
      );

      decorations.push(
        Decoration.widget(suggestion.selectionEnd, () => widget, {
          side: 1,
        }),
      );
    }
  });

  return DecorationSet.create(suggestions[0]?.selectionStart ? suggestions[0].documentId as any : null, decorations);
};

// TipTap Suggestions Extension
export const SuggestionsExtension = Extension.create({
  name: 'suggestions',

  addOptions() {
    return {
      suggestions: [] as Array<Suggestion>,
      sendSuggestionMessage: undefined as ((suggestion: Suggestion) => void) | undefined,
      artifactKind: undefined as string | undefined,
    };
  },

  addProseMirrorPlugins() {
    const { suggestions, sendSuggestionMessage, artifactKind } = this.options;

    return [
      new Plugin({
        key: suggestionsPluginKey,
        state: {
          init(_, { doc }) {
            const projectedSuggestions = projectWithPositions(doc, suggestions);
            return createDecorations(projectedSuggestions, sendSuggestionMessage, artifactKind);
          },
          apply(tr, decorations) {
            // Check if suggestions were updated via metadata
            const newSuggestions = tr.getMeta('suggestions');
            if (newSuggestions) {
              const projectedSuggestions = projectWithPositions(tr.doc, newSuggestions);
              return createDecorations(projectedSuggestions, sendSuggestionMessage, artifactKind);
            }

            // Check if decorations need to be updated via metadata
            const metaDecorations = tr.getMeta(suggestionsPluginKey);
            if (metaDecorations?.decorations) {
              return metaDecorations.decorations;
            }

            // If document changed, recreate decorations
            if (tr.docChanged) {
              const projectedSuggestions = projectWithPositions(tr.doc, suggestions);
              return createDecorations(projectedSuggestions, sendSuggestionMessage, artifactKind);
            }

            // Otherwise, map existing decorations
            return decorations.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },
});