'use dom';

import React from 'react';

interface WebViewProps {
  source: { html: string };
  style?: any;
  id?: string;
  originWhitelist?: string[];
  javaScriptEnabled?: boolean;
  domStorageEnabled?: boolean;
  allowFileAccessFromFileURLs?: boolean;
  allowUniversalAccessFromFileURLs?: boolean;
  mixedContentMode?: string;
}

export const WebView = React.forwardRef<HTMLIFrameElement, WebViewProps>((props, ref) => {
  const { source, style, id } = props;

  React.useEffect(() => {
    const iframe = document.getElementById(id || 'webview-iframe') as HTMLIFrameElement;
    if (iframe && source.html) {
      // Write the HTML content to the iframe
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(source.html);
        doc.close();
      }
    }
  }, [source.html, id]);

  return (
    <iframe
      ref={ref as any}
      id={id || 'webview-iframe'}
      style={{
        width: '100%',
        height: '100%',
        border: 'none',
        ...style
      }}
      sandbox="allow-scripts allow-same-origin"
    />
  );
});