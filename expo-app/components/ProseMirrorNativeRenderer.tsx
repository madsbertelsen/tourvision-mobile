import { PROSE_STYLES, toReactNativeStyles } from '@/styles/prose-styles';
import { Link } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View, TouchableOpacity, Alert } from 'react-native';
import CommentModal from './CommentModal';

interface ProseMirrorNativeRendererProps {
  content: any; // ProseMirror JSON document
  tripId?: string; // Optional tripId for proper back navigation
}

/**
 * Renders a ProseMirror document as native React Native components.
 * Used for read-only viewing with native Link Preview support.
 */
export default function ProseMirrorNativeRenderer({ content, tripId }: ProseMirrorNativeRendererProps) {
  const [selectedComment, setSelectedComment] = useState<any>(null);
  const [showCommentModal, setShowCommentModal] = useState(false);

  if (!content) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No content to display</Text>
      </View>
    );
  }

  // Debug: Log the document structure
  console.log('[ProseMirrorNativeRenderer] Rendering document:', JSON.stringify(content, null, 2));

  const handleCommentClick = (commentAttrs: any) => {
    console.log('[ProseMirrorNativeRenderer] Comment clicked:', commentAttrs);
    setSelectedComment(commentAttrs);
    setShowCommentModal(true);
  };

  const handleCloseComment = () => {
    setShowCommentModal(false);
    setSelectedComment(null);
  };

  const renderNode = (node: any, index: number): React.ReactNode => {
    if (!node) return null;

    switch (node.type) {
      case 'doc':
        return (
          <View key={index} style={styles.doc}>
            {node.content?.map((child: any, i: number) => renderNode(child, i))}
          </View>
        );

      case 'heading':
        const level = node.attrs?.level || 1;
        const HeadingStyle = level === 1 ? styles.h1 : level === 2 ? styles.h2 : styles.h3;
        console.log('heading style ', HeadingStyle);
        return (
          <Text key={index} style={HeadingStyle}>
            {renderInlineContent(node.content, false, true)}
          </Text>
        );

      case 'paragraph':
        // Check if paragraph contains geo-mark nodes or comments (as marks on text nodes)
        const hasGeoMarks = node.content?.some((child: any) =>
          child.type === 'geoMark'
        );
        const hasComments = node.content?.some((child: any) =>
          child.marks?.some((mark: any) => mark.type === 'comment')
        );

        if (hasGeoMarks || hasComments) {
          // Use View for paragraphs with geo-marks or comments (required for styled marks)
          return (
            <View key={index} style={styles.paragraphWithLinks}>
              {renderInlineContent(node.content, true)}
            </View>
          );
        } else {
          // Use Text for simple paragraphs
          return (
            <Text key={index} style={styles.paragraph}>
              {renderInlineContent(node.content, false)}
            </Text>
          );
        }

      case 'bulletList':
        return (
          <View key={index} style={styles.bulletList}>
            {node.content?.map((child: any, i: number) => renderNode(child, i))}
          </View>
        );

      case 'listItem':
        return (
          <View key={index} style={styles.listItem}>
            <Text style={styles.bullet}>•</Text>
            <View style={styles.listItemContent}>
              {node.content?.map((child: any, i: number) => renderNode(child, i))}
            </View>
          </View>
        );

      case 'orderedList':
        return (
          <View key={index} style={styles.orderedList}>
            {node.content?.map((child: any, i: number) => renderNode(child, i))}
          </View>
        );

      default:
        return (
          <Text key={index} style={styles.paragraph}>
            {renderInlineContent(node.content)}
          </Text>
        );
    }
  };

  const renderInlineContent = (content?: any[], inViewContext = false, inHeading = false): React.ReactNode => {
    if (!content || content.length === 0) return null;

    return content.map((node: any, index: number) => {
      // Handle geo-mark nodes (inline nodes, not marks)
      if (node.type === 'geoMark') {
        const text = node.content?.map((child: any) => child.text || '').join('') || node.attrs?.placeName || '';
        // Use geoId as key for uniqueness (fallback to geomark-index if missing)
        const key = node.attrs?.geoId || `geomark-${index}`;
        return renderGeoMark(text, node.attrs, key);
      }

      if (node.type === 'text') {
        // Check if this text has a comment mark
        const commentMark = node.marks?.find((mark: any) => mark.type === 'comment');

        if (commentMark) {
          // Render with comment styling as clickable text
          const commentStyle = commentMark.attrs?.resolved
            ? styles.commentResolved
            : styles.comment;

          // Don't override fontSize in headings
          const baseStyle = inHeading ? [] : [styles.inlineText];

          // Use commentId as key for uniqueness (fallback to comment-index if missing)
          const key = commentMark.attrs?.commentId || `comment-${index}`;

          return (
            <Text
              key={key}
              style={[...baseStyle, commentStyle]}
              onPress={() => handleCommentClick(commentMark.attrs)}
            >
              {node.text}
            </Text>
          );
        }

        // Regular text without geo-mark or comment
        // In headings, don't apply fontSize - let the heading style handle it
        const textStyle: any[] = inHeading ? [] : (inViewContext ? [styles.inlineText] : [styles.text]);

        // Apply other marks (bold, italic, etc.)
        if (node.marks) {
          node.marks.forEach((mark: any) => {
            if (mark.type === 'bold') textStyle.push(styles.bold);
            if (mark.type === 'italic') textStyle.push(styles.italic);
            if (mark.type === 'code') textStyle.push(styles.code);
          });
        }

        console.log('textStyle', textStyle, 'inHeading', inHeading);
        return (
          <Text key={`text-${index}`} style={textStyle}>
            {node.text}
          </Text>
        );
      }

      if (node.type === 'hardBreak') {
        return <Text key={`break-${index}`}>{'\n'}</Text>;
      }

      return null;
    });
  };

  const renderGeoMark = (text: string, attrs: any, key: string) => {
    const { geoId, placeName, lat, lng, description, colorIndex, visitDocument } = attrs || {};

    const locationId = geoId || 'unknown';

    // Construct full path for Stack-nested route (slide transition)
    // If no tripId, fall back to Drawer-level route
    const pathname = tripId
      ? `/(mock)/trip/${tripId}/location/[locationId]` as any
      : '/(mock)/location/[id]' as any;

    const params: any = {
      locationId,
      id: locationId,
      name: placeName || text,
      lat: lat || '0',
      lng: lng || '0',
      description: description || '',
      colorIndex: colorIndex?.toString() || '0',
      tripId: tripId, // Pass tripId so location screen can load trip data
    };

    // Pass visitDocument if it exists (contextDocument is legacy name kept for backward compatibility)
    if (visitDocument) {
      params.contextDocument = JSON.stringify(visitDocument);
    }

    return (
      <Link
        push
        key={key}
        href={{
          pathname,
          params,
        }}
      >
        <Link.Trigger asChild>
          <Text style={styles.geoMark}>{text}</Text>
        </Link.Trigger>
        <Link.Preview>
          <View style={styles.previewContainer}>
            <Text style={styles.previewTitle}>{placeName || text}</Text>
            <Text style={styles.previewCoords}>
              {lat}, {lng}
            </Text>
          </View>
        </Link.Preview>
      </Link>
    );
  };

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        {renderNode(content, 0)}
      </ScrollView>

      {/* Comment Modal - Read-only view in Read Mode */}
      {selectedComment && (
        <CommentModal
          visible={showCommentModal}
          onClose={handleCloseComment}
          onSave={() => {
            // Read-only in native renderer, just close
            handleCloseComment();
          }}
          existingComment={{
            commentId: selectedComment.commentId,
            userId: selectedComment.userId,
            userName: selectedComment.userName,
            content: selectedComment.content,
            createdAt: selectedComment.createdAt,
            resolved: selectedComment.resolved,
            replies: selectedComment.replies,
          }}
        />
      )}
    </>
  );
}

// Get shared prose styles
const proseStyles = toReactNativeStyles(PROSE_STYLES);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  contentContainer: {
    padding: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 16,
    color: '#9ca3af',
  },
  doc: {
    flex: 1,
  },
  // Typography styles from shared config
  h1: proseStyles.h1,
  h2: proseStyles.h2,
  h3: proseStyles.h3,
  paragraph: proseStyles.paragraph,
  paragraphWithLinks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    marginTop: PROSE_STYLES.paragraph.marginTop,
    marginBottom: PROSE_STYLES.paragraph.marginBottom,
  },
  text: {
    fontSize: PROSE_STYLES.paragraph.fontSize,
    color: PROSE_STYLES.paragraph.color,
  },
  inlineText: {
    fontSize: PROSE_STYLES.paragraph.fontSize,
    color: PROSE_STYLES.paragraph.color,
    lineHeight: PROSE_STYLES.paragraph.lineHeight,
  },
  // Inline marks from shared config
  bold: proseStyles.bold,
  italic: proseStyles.italic,
  code: proseStyles.code,
  // Geo-mark as inline Text (not View) for proper baseline alignment
  geoMark: {
    backgroundColor: proseStyles.geoMark.backgroundColor,
    paddingHorizontal: proseStyles.geoMark.paddingHorizontal,
    paddingVertical: proseStyles.geoMark.paddingVertical,
    borderRadius: proseStyles.geoMark.borderRadius,
    borderBottomWidth: proseStyles.geoMark.borderBottomWidth,
    borderBottomColor: proseStyles.geoMark.borderBottomColor,
    color: proseStyles.geoMark.color,
    fontWeight: proseStyles.geoMark.fontWeight as any,
    fontSize: PROSE_STYLES.paragraph.fontSize,
  },
  // Comment mark styles
  comment: {
    backgroundColor: 'rgba(251, 191, 36, 0.3)', // Amber/yellow background
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(251, 191, 36, 0.6)',
    paddingVertical: 1,
  },
  commentResolved: {
    backgroundColor: 'rgba(156, 163, 175, 0.2)', // Gray background
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(156, 163, 175, 0.4)',
    paddingVertical: 1,
    opacity: 0.7,
    textDecorationLine: 'line-through',
  },
  // Preview styles (not in prose config)
  previewContainer: {
    padding: 16,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    minWidth: 200,
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  previewCoords: {
    fontSize: 14,
    color: '#6b7280',
  },
  // List styles from shared config
  bulletList: proseStyles.bulletList,
  orderedList: proseStyles.orderedList,
  listItem: {
    flexDirection: 'row',
    marginBottom: proseStyles.listItem.marginBottom,
  },
  bullet: proseStyles.bullet,
  listItemContent: {
    flex: 1,
  },
});
