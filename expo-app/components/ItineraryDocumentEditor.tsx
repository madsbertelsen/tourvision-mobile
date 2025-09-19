import React, { useEffect, useState, useCallback, useImperativeHandle, forwardRef, useRef } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { JSONContent } from '@tiptap/react';
import ItineraryEditorDOM from './dom/ItineraryEditorDOM';
import type { Tables } from '@/lib/database.types';

interface ItineraryDocumentEditorProps {
  trip: Tables<'trips'>;
  editable?: boolean;
  onSave?: (content: JSONContent) => void;
}

export interface ItineraryDocumentEditorRef {
  setDiffDecorations: (decorations: any[]) => void;
  clearDiffDecorations: () => void;
}

interface ItineraryDocumentEditorInternalProps extends ItineraryDocumentEditorProps {
  onChatWithSelection?: (text: string) => void;
}

export const ItineraryDocumentEditor = forwardRef<
  ItineraryDocumentEditorRef,
  ItineraryDocumentEditorProps
>(({ trip, editable = false, onSave }, ref) => {
  const [content, setContent] = useState<JSONContent | null>(null);
  const editorDomRef = useRef<any>(null);

  // Convert trip data to TipTap document format
  useEffect(() => {
    if (trip.itinerary_document) {
      // If trip already has a TipTap document, use it
      setContent(trip.itinerary_document as JSONContent);
    } else {
      // Convert trip data to TipTap format
      const tipTapContent = convertTripToTipTap(trip);
      setContent(tipTapContent);
    }
  }, [trip]);

  // Handle content changes from the editor
  const handleContentChange = useCallback((newContent: JSONContent) => {
    setContent(newContent);
    if (onSave) {
      onSave(newContent);
    }
  }, [onSave]);

  // Listen for messages from DOM component
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'chat-with-selection') {
        // Trigger chat with selected text
        const selectedText = event.data.text;
        if (selectedText && window.parent !== window) {
          // Forward to the parent document view
          window.parent.postMessage({
            type: 'open-chat-with-context',
            text: selectedText
          }, '*');
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    setDiffDecorations: (decorations: any[]) => {
      console.log('ItineraryDocumentEditor - setDiffDecorations called with:', decorations);
      console.log('ItineraryDocumentEditor - editorDomRef.current:', editorDomRef.current);

      // For DOM components, we need to use message passing
      if (Platform.OS === 'web' && window.frames.length > 0) {
        // Send message to the DOM component iframe
        const frames = window.frames;
        for (let i = 0; i < frames.length; i++) {
          try {
            frames[i].postMessage({
              type: 'set-diff-decorations',
              decorations: decorations
            }, '*');
            console.log('ItineraryDocumentEditor - Sent set-diff-decorations message to frame', i);
          } catch (e) {
            console.error('ItineraryDocumentEditor - Failed to send message to frame', i, e);
          }
        }
      }

      // Also try direct ref if available
      if (editorDomRef.current?.setDiffDecorations) {
        console.log('ItineraryDocumentEditor - Calling editorDomRef.current.setDiffDecorations');
        editorDomRef.current.setDiffDecorations(decorations);
      } else {
        console.log('ItineraryDocumentEditor - editorDomRef.current.setDiffDecorations not available');
      }
    },
    clearDiffDecorations: () => {
      console.log('ItineraryDocumentEditor - clearDiffDecorations called');

      // For DOM components, we need to use message passing
      if (Platform.OS === 'web' && window.frames.length > 0) {
        // Send message to the DOM component iframe
        const frames = window.frames;
        for (let i = 0; i < frames.length; i++) {
          try {
            frames[i].postMessage({
              type: 'clear-diff-decorations'
            }, '*');
            console.log('ItineraryDocumentEditor - Sent clear-diff-decorations message to frame', i);
          } catch (e) {
            console.error('ItineraryDocumentEditor - Failed to send message to frame', i, e);
          }
        }
      }

      // Also try direct ref if available
      if (editorDomRef.current?.clearDiffDecorations) {
        console.log('ItineraryDocumentEditor - Calling editorDomRef.current.clearDiffDecorations');
        editorDomRef.current.clearDiffDecorations();
      } else {
        console.log('ItineraryDocumentEditor - editorDomRef.current.clearDiffDecorations not available');
      }
    },
  }), []);

  if (!content) {
    return null;
  }

  return (
    <View style={styles.container}>
      <ItineraryEditorDOM
        ref={editorDomRef}
        content={content}
        onChange={handleContentChange}
        editable={editable}
        dom={{
          style: {
            width: '100%',
            minHeight: 600,
            padding: '32px',
          },
        }}
      />
    </View>
  );
});

ItineraryDocumentEditor.displayName = 'ItineraryDocumentEditor';

// Helper function to convert trip data to TipTap document format
function convertTripToTipTap(trip: Tables<'trips'>): JSONContent {
  // If the trip already has an itinerary_document, return it
  if (trip.itinerary_document && typeof trip.itinerary_document === 'object') {
    return trip.itinerary_document as JSONContent;
  }

  // Otherwise, create a default document structure
  const content: JSONContent = {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 1 },
        content: [
          {
            type: 'text',
            text: trip.title || 'Untitled Trip',
          },
        ],
      },
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: trip.description || 'Add a description for your trip...',
          },
        ],
      },
      {
        type: 'day',
        attrs: {
          dayNumber: 1,
          title: 'Arrival & Gothic Quarter',
          date: '2024-09-15',
        },
        content: [
          {
            type: 'destination',
            attrs: {
              destinationId: 'bcn-airport',
              name: 'Barcelona Airport (BCN)',
              context: 'Barcelona El Prat Airport',
              colorIndex: 0,
              duration: '30 min',
              category: 'landmark',
            },
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: 'Arrival at Barcelona El Prat Airport. Collect luggage and head to taxi stand.',
                  },
                ],
              },
            ],
          },
          {
            type: 'transportation',
            attrs: {
              transportId: 'taxi-1',
              mode: 'taxi',
              fromDestination: 'Barcelona Airport',
              toDestination: 'Hotel Casa Fuster',
              duration: '25 min',
              distance: '15 km',
              cost: {
                amount: 30,
                currency: '€',
              },
            },
          },
          {
            type: 'destination',
            attrs: {
              destinationId: 'hotel-casa-fuster',
              name: 'Hotel Casa Fuster',
              context: 'Passeig de Gràcia',
              colorIndex: 1,
              duration: '1 hour',
              category: 'landmark',
              timeSlot: {
                start: '12:00 PM',
                end: '1:00 PM',
              },
            },
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: 'Check-in at 5-star hotel on Passeig de Gràcia. Drop off luggage and freshen up.',
                  },
                ],
              },
            ],
          },
          {
            type: 'groupSplit',
            attrs: {
              splitId: 'split-1',
              paths: [
                {
                  id: 'path-gothic',
                  name: 'Gothic Quarter',
                  attendees: ['Blue User', 'Purple User'],
                },
                {
                  id: 'path-beach',
                  name: 'Barceloneta Beach',
                  attendees: ['Green User'],
                },
                {
                  id: 'path-park',
                  name: 'Park Güell',
                  attendees: ['Red User'],
                },
              ],
            },
            content: [
              {
                type: 'heading',
                attrs: { level: 3 },
                content: [
                  {
                    type: 'text',
                    text: 'Group splits into 3 paths',
                  },
                ],
              },
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: 'Path 1: Gothic Quarter',
                    marks: [{ type: 'bold' }],
                  },
                ],
              },
              {
                type: 'bulletList',
                content: [
                  {
                    type: 'listItem',
                    content: [
                      {
                        type: 'paragraph',
                        content: [
                          {
                            type: 'text',
                            text: '2:30 PM - Gothic Quarter Walking Tour (€15)',
                          },
                        ],
                      },
                    ],
                  },
                  {
                    type: 'listItem',
                    content: [
                      {
                        type: 'paragraph',
                        content: [
                          {
                            type: 'text',
                            text: '4:30 PM - Barcelona Cathedral Visit (€9)',
                          },
                        ],
                      },
                    ],
                  },
                  {
                    type: 'listItem',
                    content: [
                      {
                        type: 'paragraph',
                        content: [
                          {
                            type: 'text',
                            text: '5:30 PM - Tapas at Els Quatre Gats (€35)',
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: 'Path 2: Barceloneta Beach',
                    marks: [{ type: 'bold' }],
                  },
                ],
              },
              {
                type: 'bulletList',
                content: [
                  {
                    type: 'listItem',
                    content: [
                      {
                        type: 'paragraph',
                        content: [
                          {
                            type: 'text',
                            text: '2:30 PM - Beach Time (Free)',
                          },
                        ],
                      },
                    ],
                  },
                  {
                    type: 'listItem',
                    content: [
                      {
                        type: 'paragraph',
                        content: [
                          {
                            type: 'text',
                            text: '4:30 PM - Seafood Lunch (€45)',
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: '🔄 Groups reconverge at 7:00 PM',
                marks: [{ type: 'italic' }],
              },
            ],
          },
          {
            type: 'transportation',
            attrs: {
              transportId: 'walk-2',
              mode: 'walking',
              fromDestination: 'Gothic Quarter',
              toDestination: 'Hotel Casa Fuster',
              duration: '15 min',
              distance: '1.2 km',
            },
          },
          {
            type: 'destination',
            attrs: {
              destinationId: 'hotel-rest',
              name: 'Hotel Casa Fuster',
              context: 'Evening rest',
              colorIndex: 1,
              duration: '30 min',
              category: 'landmark',
            },
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: 'Rest at hotel before dinner.',
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        type: 'day',
        attrs: {
          dayNumber: 2,
          title: 'Gaudí Tour',
          date: '2024-09-16',
        },
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Explore the architectural wonders of Antoni Gaudí.',
              },
            ],
          },
        ],
      },
    ],
  };

  return content;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
  },
});