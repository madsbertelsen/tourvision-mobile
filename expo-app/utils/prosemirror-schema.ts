import { Schema, NodeSpec, MarkSpec } from 'prosemirror-model';

// Counter for generating unique geo IDs during paste operations
let geoIdCounter = 0;

// Define custom node specs
const nodes: { [key: string]: NodeSpec } = {
  doc: {
    content: "block+"
  },

  paragraph: {
    content: "inline*",
    group: "block",
    attrs: {
      id: { default: null }
    },
    parseDOM: [{
      tag: "p",
      getAttrs(dom: any) {
        return { id: dom.getAttribute("id") };
      }
    }],
    toDOM(node) {
      return ["p", node.attrs.id ? { id: node.attrs.id } : {}, 0];
    }
  },

  heading: {
    attrs: {
      level: { default: 1 },
      id: { default: null }
    },
    content: "inline*",
    group: "block",
    defining: true,
    parseDOM: [
      { tag: "h1", attrs: { level: 1 } },
      { tag: "h2", attrs: { level: 2 } },
      { tag: "h3", attrs: { level: 3 } },
      { tag: "h4", attrs: { level: 4 } },
      { tag: "h5", attrs: { level: 5 } },
      { tag: "h6", attrs: { level: 6 } }
    ],
    toDOM(node) {
      return ["h" + node.attrs.level, node.attrs.id ? { id: node.attrs.id } : {}, 0];
    }
  },

  blockquote: {
    content: "block+",
    group: "block",
    defining: true,
    parseDOM: [{ tag: "blockquote" }],
    toDOM() { return ["blockquote", 0]; }
  },

  bulletList: {
    content: "listItem+",
    group: "block",
    parseDOM: [{ tag: "ul" }],
    toDOM() { return ["ul", 0]; }
  },

  orderedList: {
    content: "listItem+",
    group: "block",
    attrs: {
      order: { default: 1 }
    },
    parseDOM: [{
      tag: "ol",
      getAttrs(dom: any) {
        return { order: dom.hasAttribute("start") ? +dom.getAttribute("start")! : 1 };
      }
    }],
    toDOM(node) {
      return node.attrs.order == 1 ? ["ol", 0] : ["ol", { start: node.attrs.order }, 0];
    }
  },

  listItem: {
    content: "paragraph block*",
    parseDOM: [{ tag: "li" }],
    toDOM() { return ["li", 0]; },
    defining: true
  },

  text: {
    group: "inline"
  },

  hardBreak: {
    inline: true,
    group: "inline",
    selectable: false,
    parseDOM: [{ tag: "br" }],
    toDOM() { return ["br"]; }
  },

  // Custom inline node for geo-marked locations
  geoMark: {
    inline: true,
    group: "inline",
    content: "text*",
    atom: true,
    attrs: {
      lat: { default: null },
      lng: { default: null },
      placeName: { default: "" },
      geoId: { default: null },
      transportFrom: { default: null },
      transportProfile: { default: null },
      coordSource: { default: null },
      description: { default: null },
      photoName: { default: null },
      colorIndex: { default: 0 },
      waypoints: { default: null }, // Array of {lat, lng} waypoints for route customization
      visitDocument: { default: null } // ProseMirror document JSON for visit-specific notes
    },
    parseDOM: [{
      tag: "span.geo-mark",
      getAttrs(dom: any) {
        const waypointsStr = dom.getAttribute("data-waypoints");
        let waypoints = null;
        if (waypointsStr) {
          try {
            waypoints = JSON.parse(waypointsStr);
          } catch (e) {
            console.error('Failed to parse waypoints:', e);
          }
        }

        const visitDocStr = dom.getAttribute("data-visit-document");
        let visitDocument = null;
        if (visitDocStr) {
          try {
            visitDocument = JSON.parse(visitDocStr);
          } catch (e) {
            console.error('Failed to parse visitDocument:', e);
          }
        }

        // Generate geoId if not present (e.g., when pasting from chat)
        let geoId = dom.getAttribute("data-geo-id");
        if (!geoId) {
          // Use counter and random string to ensure uniqueness when pasting multiple locations at once
          const counter = geoIdCounter++;
          const random = Math.random().toString(36).substr(2, 9);
          geoId = `geo-${Date.now()}-${counter}-${random}`;
        }

        return {
          lat: dom.getAttribute("data-lat"),
          lng: dom.getAttribute("data-lng"),
          placeName: dom.getAttribute("data-place-name") || dom.textContent,
          geoId: geoId,
          transportFrom: dom.getAttribute("data-transport-from"),
          transportProfile: dom.getAttribute("data-transport-profile"),
          coordSource: dom.getAttribute("data-coord-source"),
          description: dom.getAttribute("data-description"),
          photoName: dom.getAttribute("data-photo-name"),
          colorIndex: dom.getAttribute("data-color-index") ? parseInt(dom.getAttribute("data-color-index")) : 0,
          waypoints,
          visitDocument
        };
      }
    }],
    toDOM(node) {
      const attrs: any = {
        class: "geo-mark",
        "data-geo": "true"
      };

      if (node.attrs.lat) attrs["data-lat"] = node.attrs.lat;
      if (node.attrs.lng) attrs["data-lng"] = node.attrs.lng;
      if (node.attrs.placeName) attrs["data-place-name"] = node.attrs.placeName;
      // Always output geoId (it should always exist after parseDOM generates it)
      attrs["data-geo-id"] = node.attrs.geoId || `geo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      if (node.attrs.transportFrom) attrs["data-transport-from"] = node.attrs.transportFrom;
      if (node.attrs.transportProfile) attrs["data-transport-profile"] = node.attrs.transportProfile;
      if (node.attrs.coordSource) attrs["data-coord-source"] = node.attrs.coordSource;
      if (node.attrs.description) attrs["data-description"] = node.attrs.description;
      if (node.attrs.photoName) attrs["data-photo-name"] = node.attrs.photoName;
      if (node.attrs.colorIndex !== undefined) attrs["data-color-index"] = node.attrs.colorIndex;
      if (node.attrs.waypoints) attrs["data-waypoints"] = JSON.stringify(node.attrs.waypoints);
      if (node.attrs.visitDocument) attrs["data-visit-document"] = JSON.stringify(node.attrs.visitDocument);

      return ["span", attrs, 0];
    }
  }
};

// Define mark specs
const marks: { [key: string]: MarkSpec } = {
  bold: {
    parseDOM: [
      { tag: "strong" },
      { tag: "b" },
      { style: "font-weight", getAttrs: (value: any) => /^(bold(er)?|[5-9]\d{2,})$/.test(value) && null }
    ],
    toDOM() { return ["strong", 0]; }
  },

  italic: {
    parseDOM: [
      { tag: "em" },
      { tag: "i" },
      { style: "font-style=italic" }
    ],
    toDOM() { return ["em", 0]; }
  },

  link: {
    attrs: {
      href: {},
      title: { default: null },
      target: { default: null }
    },
    inclusive: false,
    parseDOM: [{
      tag: "a[href]",
      getAttrs(dom: any) {
        return {
          href: dom.getAttribute("href"),
          title: dom.getAttribute("title"),
          target: dom.getAttribute("target")
        };
      }
    }],
    toDOM(node) {
      const { href, title, target } = node.attrs;
      const attrs: any = { href };
      if (title) attrs.title = title;
      if (target) attrs.target = target;
      return ["a", attrs, 0];
    }
  },

  // Custom mark for comments/annotations
  comment: {
    attrs: {
      commentId: { default: null },
      userId: { default: null },
      userName: { default: "" },
      content: { default: "" },
      createdAt: { default: null },
      resolved: { default: false },
      replies: { default: null } // Array of reply objects
    },
    inclusive: false,
    parseDOM: [{
      tag: "span.comment-mark",
      getAttrs(dom: any) {
        const repliesStr = dom.getAttribute("data-replies");
        let replies = null;
        if (repliesStr) {
          try {
            replies = JSON.parse(repliesStr);
          } catch (e) {
            console.error('Failed to parse replies:', e);
          }
        }

        return {
          commentId: dom.getAttribute("data-comment-id"),
          userId: dom.getAttribute("data-user-id"),
          userName: dom.getAttribute("data-user-name") || "",
          content: dom.getAttribute("data-content") || "",
          createdAt: dom.getAttribute("data-created-at"),
          resolved: dom.getAttribute("data-resolved") === "true",
          replies
        };
      }
    }],
    toDOM(mark) {
      const attrs: any = {
        class: "comment-mark",
        "data-comment": "true"
      };

      if (mark.attrs.commentId) attrs["data-comment-id"] = mark.attrs.commentId;
      if (mark.attrs.userId) attrs["data-user-id"] = mark.attrs.userId;
      if (mark.attrs.userName) attrs["data-user-name"] = mark.attrs.userName;
      if (mark.attrs.content) attrs["data-content"] = mark.attrs.content;
      if (mark.attrs.createdAt) attrs["data-created-at"] = mark.attrs.createdAt;
      if (mark.attrs.resolved !== undefined) attrs["data-resolved"] = mark.attrs.resolved.toString();
      if (mark.attrs.replies) attrs["data-replies"] = JSON.stringify(mark.attrs.replies);

      return ["span", attrs, 0];
    }
  }
};

// Create the schema
export const schema = new Schema({ nodes, marks });

// Helper to identify geo-mark nodes
export function isGeoMarkNode(node: any): boolean {
  return node.type === schema.nodes.geoMark;
}

// Helper to extract all geo-marks from a document
export function extractGeoMarks(doc: any): Array<{
  pos: number;
  text: string;
  attrs: any;
}> {
  const geoMarks: Array<{ pos: number; text: string; attrs: any }> = [];

  doc.descendants((node: any, pos: number) => {
    if (node.type === schema.nodes.geoMark) {
      geoMarks.push({
        pos,
        text: node.textContent || node.attrs.placeName || '',
        attrs: node.attrs
      });
    }
  });

  return geoMarks;
}

// Helper to find a node by ID attribute
export function findNodeById(doc: any, id: string): { node: any; pos: number } | null {
  let result: { node: any; pos: number } | null = null;

  doc.descendants((node: any, pos: number) => {
    if (node.attrs?.id === id) {
      result = { node, pos };
      return false; // Stop searching
    }
  });

  return result;
}