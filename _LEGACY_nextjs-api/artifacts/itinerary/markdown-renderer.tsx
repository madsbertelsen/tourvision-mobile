'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import type { Location } from './location-parser';

interface MarkdownRendererProps {
  content: string;
  locations: Location[];
  className?: string;
}

/**
 * Custom markdown renderer that adds data attributes to location links
 * for viewport tracking
 */
export function MarkdownRenderer({ content, locations, className }: MarkdownRendererProps) {
  // Create a map of URLs to location names for quick lookup
  const urlToLocationMap = React.useMemo(() => {
    const map = new Map<string, string>();
    locations.forEach(loc => {
      if (loc.url) {
        map.set(loc.url, loc.name);
      }
    });
    return map;
  }, [locations]);
  
  return (
    <ReactMarkdown
      className={className}
      components={{
        a: ({ href, children, ...props }) => {
          // Check if this link corresponds to a location
          const locationName = href ? urlToLocationMap.get(href) : null;
          
          return (
            <a
              href={href}
              data-location-name={locationName || undefined}
              className="text-blue-600 hover:text-blue-800 underline transition-colors"
              target="_blank"
              rel="noopener noreferrer"
              {...props}
            >
              {children}
            </a>
          );
        },
        h1: ({ children, ...props }) => (
          <h1 className="text-3xl font-bold mb-4 mt-6" {...props}>{children}</h1>
        ),
        h2: ({ children, ...props }) => (
          <h2 className="text-2xl font-semibold mb-3 mt-5" {...props}>{children}</h2>
        ),
        h3: ({ children, ...props }) => (
          <h3 className="text-xl font-semibold mb-2 mt-4" {...props}>{children}</h3>
        ),
        p: ({ children, ...props }) => (
          <p className="mb-4 leading-relaxed" {...props}>{children}</p>
        ),
        ul: ({ children, ...props }) => (
          <ul className="list-disc pl-6 mb-4 space-y-2" {...props}>{children}</ul>
        ),
        ol: ({ children, ...props }) => (
          <ol className="list-decimal pl-6 mb-4 space-y-2" {...props}>{children}</ol>
        ),
        li: ({ children, ...props }) => (
          <li className="leading-relaxed" {...props}>{children}</li>
        ),
        strong: ({ children, ...props }) => (
          <strong className="font-semibold" {...props}>{children}</strong>
        ),
        em: ({ children, ...props }) => (
          <em className="italic" {...props}>{children}</em>
        ),
        blockquote: ({ children, ...props }) => (
          <blockquote className="border-l-4 border-gray-300 pl-4 italic my-4" {...props}>
            {children}
          </blockquote>
        ),
        code: ({ children, ...props }) => {
          // Check if it's inline code or code block
          const isInline = !props.className;
          if (isInline) {
            return (
              <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-sm" {...props}>
                {children}
              </code>
            );
          }
          return (
            <code className="block bg-gray-100 dark:bg-gray-800 p-4 rounded overflow-x-auto text-sm" {...props}>
              {children}
            </code>
          );
        }
      }}
    >
      {content}
    </ReactMarkdown>
  );
}