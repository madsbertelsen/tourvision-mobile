import { PROSE_STYLES, toReactNativeStyles } from '@/styles/prose-styles';
import { Link } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

interface ProseMirrorNativeRendererProps {
  content: any; // ProseMirror JSON document
  tripId?: string; // Optional tripId for proper back navigation
}

/**
 * Renders a ProseMirror document as native React Native components.
 * Used for read-only viewing with native Link Preview support.
 */
export default function ProseMirrorNativeRenderer({ content, tripId }: ProseMirrorNativeRendererProps) {
  if (!content) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No content to display</Text>
      </View>
    );
  }

  // Debug: Log the document structure
  console.log('[ProseMirrorNativeRenderer] Rendering document:', JSON.stringify(content, null, 2));

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
        // Check if paragraph contains geo-marks (as marks on text nodes)
        const hasGeoMarks = node.content?.some((child: any) =>
          child.marks?.some((mark: any) => mark.type === 'geoMark')
        );

        if (hasGeoMarks) {
          // Use View for paragraphs with geo-marks (required for Link.Preview)
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
      if (node.type === 'text') {
        // Check if this text has a geoMark mark
        const geoMarkMark = node.marks?.find((mark: any) => mark.type === 'geoMark');

        if (geoMarkMark) {
          // Render as a Link with geo-mark styling
          return renderGeoMark(node.text, geoMarkMark.attrs, index);
        }

        // Regular text without geo-mark
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
          <Text key={index} style={textStyle}>
            {node.text}
          </Text>
        );
      }

      if (node.type === 'hardBreak') {
        return <Text key={index}>{'\n'}</Text>;
      }

      return null;
    });
  };

  const renderGeoMark = (text: string, attrs: any, index: number) => {
    const { geoId, placeName, lat, lng, description, colorIndex } = attrs || {};

    const params: any = {
      id: geoId || 'unknown',
      name: placeName || text,
      lat: lat || '0',
      lng: lng || '0',
      description: description || '',
      colorIndex: colorIndex?.toString() || '0',
    };

    // Add tripId if available for proper back navigation
    if (tripId) {
      params.tripId = tripId;
    }

    return (
      <Link
      push
        key={index}
        href={{
          pathname: '/(mock)/location/[id]',
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
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {renderNode(content, 0)}
    </ScrollView>
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
