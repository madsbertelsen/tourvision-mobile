/**
 * Shared ProseMirror styling configuration
 * Used by both React Native renderer and WebView CSS
 */

export interface ProseStyleConfig {
  // Base font size in pixels (used as reference for em calculations)
  baseFontSize: number;

  // Typography
  paragraph: {
    fontSize: number;
    color: string;
    lineHeight: number;
    marginTop: number;
    marginBottom: number;
  };

  h1: {
    fontSize: number;
    fontWeight: 'bold' | 'normal';
    color: string;
    marginTop: number;
    marginBottom: number;
  };

  h2: {
    fontSize: number;
    fontWeight: 'bold' | 'normal';
    color: string;
    marginTop: number;
    marginBottom: number;
  };

  h3: {
    fontSize: number;
    fontWeight: 'bold' | 'normal';
    color: string;
    marginTop: number;
    marginBottom: number;
  };

  // Inline marks
  bold: {
    fontWeight: 'bold';
  };

  italic: {
    fontStyle: 'italic';
  };

  code: {
    fontFamily: string;
    backgroundColor: string;
    paddingHorizontal: number;
    paddingVertical: number;
    borderRadius: number;
  };

  // Geo-mark styles
  geoMark: {
    color: string;
    fontWeight: string;
    backgroundColor: string;
    paddingHorizontal: number;
    paddingVertical: number;
    borderRadius: number;
    borderBottomWidth: number;
    borderBottomColor: string;
  };

  // Lists
  bulletList: {
    marginBottom: number;
    paddingLeft: number;
  };

  orderedList: {
    marginBottom: number;
    paddingLeft: number;
  };

  listItem: {
    marginBottom: number;
  };

  bullet: {
    fontSize: number;
    color: string;
    marginRight: number;
    lineHeight: number;
  };
}

/**
 * Base prose style configuration
 * All values in pixels for consistency
 */
export const PROSE_STYLES: ProseStyleConfig = {
  baseFontSize: 16,

  paragraph: {
    fontSize: 16,
    color: '#000000',
    lineHeight: 24,
    marginTop: 16,
    marginBottom: 16,
  },

  h1: {
    fontSize: 60, // Even larger to match Edit Mode WebView
    fontWeight: 'bold',
    color: '#111827',
    marginTop: 20,
    marginBottom: 20,
  },

  h2: {
    fontSize: 24, // 1.5em
    fontWeight: 'bold',
    color: '#111827',
    marginTop: 18, // 0.75em relative to h2
    marginBottom: 18,
  },

  h3: {
    fontSize: 19, // ~1.17em
    fontWeight: 'bold',
    color: '#111827',
    marginTop: 14,
    marginBottom: 14,
  },

  bold: {
    fontWeight: 'bold',
  },

  italic: {
    fontStyle: 'italic',
  },

  code: {
    fontFamily: 'monospace',
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 3,
  },

  geoMark: {
    color: '#000000',
    fontWeight: '500',
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 3,
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(59, 130, 246, 0.5)',
  },

  bulletList: {
    marginBottom: 16,
    paddingLeft: 30,
  },

  orderedList: {
    marginBottom: 16,
    paddingLeft: 30,
  },

  listItem: {
    marginBottom: 4,
  },

  bullet: {
    fontSize: 16,
    color: '#374151',
    marginRight: 8,
    lineHeight: 24,
  },
};

/**
 * Convert shared config to React Native StyleSheet properties
 */
export function toReactNativeStyles(config: ProseStyleConfig) {
  return {
    paragraph: {
      fontSize: config.paragraph.fontSize,
      color: config.paragraph.color,
      lineHeight: config.paragraph.lineHeight,
      marginTop: config.paragraph.marginTop,
      marginBottom: config.paragraph.marginBottom,
    },

    h1: {
      fontSize: config.h1.fontSize,
      fontWeight: config.h1.fontWeight,
      color: config.h1.color,
      marginTop: config.h1.marginTop,
      marginBottom: config.h1.marginBottom,
    },

    h2: {
      fontSize: config.h2.fontSize,
      fontWeight: config.h2.fontWeight,
      color: config.h2.color,
      marginTop: config.h2.marginTop,
      marginBottom: config.h2.marginBottom,
    },

    h3: {
      fontSize: config.h3.fontSize,
      fontWeight: config.h3.fontWeight,
      color: config.h3.color,
      marginTop: config.h3.marginTop,
      marginBottom: config.h3.marginBottom,
    },

    bold: {
      fontWeight: config.bold.fontWeight,
    },

    italic: {
      fontStyle: config.italic.fontStyle,
    },

    code: {
      fontFamily: config.code.fontFamily,
      backgroundColor: config.code.backgroundColor,
      paddingHorizontal: config.code.paddingHorizontal,
      paddingVertical: config.code.paddingVertical,
      borderRadius: config.code.borderRadius,
    },

    geoMark: {
      color: config.geoMark.color,
      fontWeight: config.geoMark.fontWeight as any,
      backgroundColor: config.geoMark.backgroundColor,
      paddingHorizontal: config.geoMark.paddingHorizontal,
      paddingVertical: config.geoMark.paddingVertical,
      borderRadius: config.geoMark.borderRadius,
      borderBottomWidth: config.geoMark.borderBottomWidth,
      borderBottomColor: config.geoMark.borderBottomColor,
    },

    bulletList: {
      marginBottom: config.bulletList.marginBottom,
      paddingLeft: config.bulletList.paddingLeft,
    },

    orderedList: {
      marginBottom: config.orderedList.marginBottom,
      paddingLeft: config.orderedList.paddingLeft,
    },

    listItem: {
      marginBottom: config.listItem.marginBottom,
    },

    bullet: {
      fontSize: config.bullet.fontSize,
      color: config.bullet.color,
      marginRight: config.bullet.marginRight,
      lineHeight: config.bullet.lineHeight,
    },
  };
}

/**
 * Generate CSS string from shared config
 */
export function toCSS(config: ProseStyleConfig): string {
  return `
    .ProseMirror p {
      font-size: ${config.paragraph.fontSize}px;
      color: ${config.paragraph.color};
      line-height: ${config.paragraph.lineHeight}px;
      margin: ${config.paragraph.marginTop}px 0 ${config.paragraph.marginBottom}px 0;
    }

    .ProseMirror h1 {
      font-size: ${config.h1.fontSize}px;
      font-weight: ${config.h1.fontWeight};
      color: ${config.h1.color};
      margin: ${config.h1.marginTop}px 0 ${config.h1.marginBottom}px 0;
    }

    .ProseMirror h2 {
      font-size: ${config.h2.fontSize}px;
      font-weight: ${config.h2.fontWeight};
      color: ${config.h2.color};
      margin: ${config.h2.marginTop}px 0 ${config.h2.marginBottom}px 0;
    }

    .ProseMirror h3 {
      font-size: ${config.h3.fontSize}px;
      font-weight: ${config.h3.fontWeight};
      color: ${config.h3.color};
      margin: ${config.h3.marginTop}px 0 ${config.h3.marginBottom}px 0;
    }

    .ProseMirror strong {
      font-weight: ${config.bold.fontWeight};
    }

    .ProseMirror em {
      font-style: ${config.italic.fontStyle};
    }

    .ProseMirror code {
      font-family: ${config.code.fontFamily};
      background-color: ${config.code.backgroundColor};
      padding: ${config.code.paddingVertical}px ${config.code.paddingHorizontal}px;
      border-radius: ${config.code.borderRadius}px;
    }

    .ProseMirror .geo-mark {
      color: ${config.geoMark.color};
      font-weight: ${config.geoMark.fontWeight};
      background-color: ${config.geoMark.backgroundColor};
      padding: ${config.geoMark.paddingVertical}px ${config.geoMark.paddingHorizontal}px;
      border-radius: ${config.geoMark.borderRadius}px;
      border-bottom: ${config.geoMark.borderBottomWidth}px solid ${config.geoMark.borderBottomColor};
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .ProseMirror .geo-mark:hover {
      background-color: rgba(59, 130, 246, 0.3);
      border-bottom-color: rgba(59, 130, 246, 0.8);
    }

    .ProseMirror ul, .ProseMirror ol {
      margin-bottom: ${config.bulletList.marginBottom}px;
      padding-left: ${config.bulletList.paddingLeft}px;
    }

    .ProseMirror li {
      margin-bottom: ${config.listItem.marginBottom}px;
    }
  `.trim();
}
