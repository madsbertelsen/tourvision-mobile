import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';

interface ProgressiveDocumentRendererProps {
  document: any;
  showCursor?: boolean;
}

export default function ProgressiveDocumentRenderer({ document, showCursor }: ProgressiveDocumentRendererProps) {
  const renderNode = (node: any, key: number) => {
    switch (node.type) {
      case 'heading':
        const HeadingTag = node.attrs?.level === 1 ? Text : Text;
        const headingStyle = node.attrs?.level === 1 ? styles.h1 : styles.h2;
        return (
          <View key={key} style={styles.nodeContainer}>
            <HeadingTag style={headingStyle}>
              {renderContent(node.content)}
            </HeadingTag>
          </View>
        );

      case 'paragraph':
        if (!node.content || node.content.length === 0) {
          return <View key={key} style={styles.emptyParagraph} />;
        }
        return (
          <View key={key} style={styles.nodeContainer}>
            <Text style={styles.paragraph}>
              {renderContent(node.content)}
            </Text>
          </View>
        );

      default:
        return null;
    }
  };

  const renderContent = (content: any[]) => {
    if (!content) return null;

    return content.map((node, index) => {
      if (node.type === 'text') {
        const hasStrong = node.marks?.some((m: any) => m.type === 'strong');
        return (
          <Text key={index} style={hasStrong ? styles.strong : undefined}>
            {node.text}
          </Text>
        );
      } else if (node.type === 'geoMark') {
        const colors = [
          '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444',
          '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
        ];
        const colorIndex = node.attrs?.colorIndex ?? 0;
        const bgColor = `${colors[colorIndex % colors.length]}33`; // 33 = 20% opacity

        return (
          <Text
            key={index}
            style={[styles.geoMark, { backgroundColor: bgColor }]}
          >
            {renderContent(node.content)}
          </Text>
        );
      }
      return null;
    });
  };

  if (!document || !document.content) {
    return <View style={styles.container} />;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {document.content.map((node: any, index: number) => renderNode(node, index))}
      {showCursor && (
        <View style={styles.cursorContainer}>
          <View style={styles.cursor} />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  contentContainer: {
    padding: 24,
  },
  nodeContainer: {
    marginBottom: 16,
  },
  emptyParagraph: {
    height: 20,
    marginBottom: 16,
  },
  h1: {
    fontSize: 36,
    fontWeight: '700',
    color: '#111827',
    lineHeight: 40,
  },
  h2: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    lineHeight: 32,
    marginTop: 8,
  },
  paragraph: {
    fontSize: 16,
    color: '#374151',
    lineHeight: 24,
  },
  strong: {
    fontWeight: '700',
    color: '#111827',
  },
  geoMark: {
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
    fontWeight: '600',
  },
  cursorContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: -20,
  },
  cursor: {
    width: 2,
    height: 24,
    backgroundColor: '#3b82f6',
  },
});
