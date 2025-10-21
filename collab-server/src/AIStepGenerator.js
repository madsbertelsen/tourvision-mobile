import { Schema, DOMParser, Node as PMNode } from 'prosemirror-model';
import { Transform, ReplaceStep, AddMarkStep, RemoveMarkStep } from 'prosemirror-transform';
import { schema as basicSchema } from 'prosemirror-schema-basic';
import { addListNodes } from 'prosemirror-schema-list';
import { v4 as uuidv4 } from 'uuid';
import { JSDOM } from 'jsdom';

/**
 * AIStepGenerator - Converts AI-generated text/HTML into ProseMirror steps
 * This class handles the transformation of LLM output into proper ProseMirror
 * transactions that can be applied to the collaborative document.
 */
export class AIStepGenerator {
  constructor(collabManager) {
    this.collabManager = collabManager;
    this.schema = this.createSchema();
    this.domParser = this.createDOMParser();
  }

  /**
   * Create the ProseMirror schema matching the client schema
   */
  createSchema() {
    const nodes = addListNodes(basicSchema.spec.nodes, 'paragraph block*', 'block');

    // Add geoMark node to match client schema
    const geoMarkNode = {
      inline: true,
      group: 'inline',
      content: 'text*',
      attrs: {
        geoId: { default: null },
        placeName: { default: '' },
        lat: { default: null },
        lng: { default: null },
        colorIndex: { default: 0 },
        coordSource: { default: 'ai' },
        description: { default: null },
        visitDocument: { default: null },
        photoName: { default: null }
      },
      parseDOM: [{
        tag: 'span.geo-mark',
        getAttrs(dom) {
          return {
            geoId: dom.getAttribute('data-geo-id'),
            placeName: dom.getAttribute('data-place-name'),
            lat: parseFloat(dom.getAttribute('data-lat')),
            lng: parseFloat(dom.getAttribute('data-lng')),
            colorIndex: parseInt(dom.getAttribute('data-color-index') || '0'),
            coordSource: dom.getAttribute('data-coord-source') || 'ai'
          };
        }
      }],
      toDOM(node) {
        return ['span', {
          class: 'geo-mark',
          'data-geo-id': node.attrs.geoId,
          'data-place-name': node.attrs.placeName,
          'data-lat': node.attrs.lat,
          'data-lng': node.attrs.lng,
          'data-color-index': node.attrs.colorIndex,
          'data-coord-source': node.attrs.coordSource
        }, 0];
      }
    };

    const customNodes = nodes.addToEnd('geoMark', geoMarkNode);

    return new Schema({
      nodes: customNodes,
      marks: basicSchema.spec.marks
    });
  }

  /**
   * Create DOM parser for converting HTML to ProseMirror
   */
  createDOMParser() {
    return DOMParser.fromSchema(this.schema);
  }

  /**
   * Generate steps for inserting content at a position or replacing a range
   */
  async generateStepsForContent(documentId, content, options = {}) {
    const docState = this.collabManager.getDocument(documentId);
    if (!docState) {
      throw new Error('Document not found');
    }

    // Parse the current document
    const currentDoc = this.parseDocument(docState.doc);

    // Create a transform
    const tr = new Transform(currentDoc);

    try {
      // Parse AI-generated content
      const newContent = await this.parseAIContent(content, options);

      if (options.replaceRange) {
        // Replace existing content
        const { from, to } = options.replaceRange;
        tr.replace(from, to, newContent.slice(0, newContent.content.size));
      } else {
        // Insert at position or append
        const pos = options.position ?? currentDoc.content.size;

        // Ensure we're inserting at a valid position
        const $pos = currentDoc.resolve(Math.min(pos, currentDoc.content.size));
        const insertPos = $pos.pos;

        // Insert the new content
        newContent.content.forEach((node, offset) => {
          if (node.isBlock) {
            // For block nodes, insert between blocks
            tr.insert(insertPos + offset, node);
          } else {
            // For inline content, insert within the paragraph
            const slice = newContent.slice(offset, offset + node.nodeSize);
            tr.replace(insertPos + offset, insertPos + offset, slice);
          }
        });
      }

      // Extract steps from the transform
      return tr.steps.map(step => step.toJSON());

    } catch (error) {
      console.error('Error generating steps:', error);
      return [];
    }
  }

  /**
   * Parse AI-generated content (text or HTML) into ProseMirror nodes
   */
  async parseAIContent(content, options = {}) {
    // Detect if content is HTML or plain text
    const isHTML = /<[^>]+>/.test(content);

    if (isHTML) {
      return this.parseHTMLContent(content);
    } else {
      return this.parseTextContent(content, options);
    }
  }

  /**
   * Parse HTML content into ProseMirror document
   */
  parseHTMLContent(html) {
    // Process geo-marks in HTML if present
    const processedHTML = this.processGeoMarks(html);

    // Create a DOM from the HTML
    const dom = new JSDOM(processedHTML);
    const doc = dom.window.document;

    // Parse with ProseMirror's DOMParser
    const pmDoc = this.domParser.parse(doc.body);

    return pmDoc;
  }

  /**
   * Parse plain text content into ProseMirror nodes
   */
  parseTextContent(text, options = {}) {
    const nodes = [];
    const lines = text.split('\n');

    lines.forEach((line, index) => {
      if (line.trim() === '') {
        // Empty line becomes a paragraph
        nodes.push(this.schema.nodes.paragraph.create());
      } else {
        // Detect headings
        const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
        if (headingMatch) {
          const level = headingMatch[1].length;
          const content = headingMatch[2];
          const headingType = `heading${level}`;

          if (this.schema.nodes[headingType]) {
            nodes.push(
              this.schema.nodes[headingType].create(
                { level },
                this.parseInlineContent(content)
              )
            );
          } else {
            // Fallback to paragraph if heading not in schema
            nodes.push(
              this.schema.nodes.paragraph.create(
                {},
                this.parseInlineContent(content)
              )
            );
          }
        } else {
          // Regular paragraph
          nodes.push(
            this.schema.nodes.paragraph.create(
              {},
              this.parseInlineContent(line)
            )
          );
        }
      }
    });

    // Create a document fragment
    return this.schema.node('doc', null, nodes);
  }

  /**
   * Parse inline content and detect location references
   */
  parseInlineContent(text) {
    const nodes = [];

    // Simple regex to detect location-like phrases
    // In production, this could use NLP or more sophisticated detection
    const locationRegex = /\b([A-Z][a-zA-Z\s]+(?:Temple|Tower|Park|Museum|Station|Restaurant|Hotel|Beach|Market|Square|Palace))\b/g;

    let lastIndex = 0;
    let match;

    while ((match = locationRegex.exec(text)) !== null) {
      // Add text before the location
      if (match.index > lastIndex) {
        nodes.push(
          this.schema.text(text.slice(lastIndex, match.index))
        );
      }

      // Create a geo-mark for the location
      const locationName = match[1];
      const geoMark = this.schema.nodes.geoMark.create(
        {
          geoId: `loc-${uuidv4()}`,
          placeName: locationName,
          // Coordinates would be resolved later via geocoding service
          lat: null,
          lng: null,
          colorIndex: this.getNextColorIndex(),
          coordSource: 'pending'
        },
        this.schema.text(locationName)
      );

      nodes.push(geoMark);
      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      nodes.push(
        this.schema.text(text.slice(lastIndex))
      );
    }

    return nodes.length > 0 ? nodes : [this.schema.text(text)];
  }

  /**
   * Process geo-marks in HTML content
   */
  processGeoMarks(html) {
    // Replace AI-generated location spans with proper geo-marks
    return html.replace(
      /<span class="location"[^>]*>([^<]+)<\/span>/g,
      (match, locationName) => {
        const geoId = `loc-${uuidv4()}`;
        return `<span class="geo-mark" data-geo-id="${geoId}" data-place-name="${locationName}" data-coord-source="ai">${locationName}</span>`;
      }
    );
  }

  /**
   * Parse a document JSON into ProseMirror Node
   */
  parseDocument(docJSON) {
    return PMNode.fromJSON(this.schema, docJSON);
  }

  /**
   * Get the next color index for geo-marks
   */
  getNextColorIndex() {
    // In a real implementation, this would track used colors in the document
    return Math.floor(Math.random() * 10);
  }

  /**
   * Generate steps for inline editing (replacing selected text)
   */
  async generateInlineEditSteps(documentId, from, to, newContent) {
    return this.generateStepsForContent(documentId, newContent, {
      replaceRange: { from, to }
    });
  }

  /**
   * Generate steps for appending content at the end
   */
  async generateAppendSteps(documentId, content) {
    const docState = this.collabManager.getDocument(documentId);
    if (!docState) {
      throw new Error('Document not found');
    }

    const currentDoc = this.parseDocument(docState.doc);
    const endPos = currentDoc.content.size;

    return this.generateStepsForContent(documentId, content, {
      position: endPos
    });
  }

  /**
   * Generate steps for inserting at cursor position
   */
  async generateInsertSteps(documentId, position, content) {
    return this.generateStepsForContent(documentId, content, {
      position
    });
  }
}