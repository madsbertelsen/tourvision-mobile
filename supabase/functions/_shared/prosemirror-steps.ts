/**
 * ProseMirror Step Generation Module
 * Converts HTML operations to ProseMirror transaction steps for proper document transformation
 */

import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.43/deno-dom-wasm.ts";

/**
 * Represents a ProseMirror ReplaceStep
 */
interface ReplaceStep {
  stepType: "replace";
  from: number;
  to: number;
  slice: {
    content: any[];
    openStart: number;
    openEnd: number;
  };
}

/**
 * Represents a generic ProseMirror step
 */
interface Step {
  stepType: string;
  from: number;
  to?: number;
  slice?: any;
  mark?: any;
  [key: string]: any;
}

/**
 * Metadata for a transaction
 */
interface TransactionMetadata {
  time: number;
  origin: string;
  userPrompt?: string;
  aiModel?: string;
  aiConfidence?: number;
  aiReasoning?: string;
}

/**
 * Complete transaction data structure
 */
export interface Transaction {
  steps: Step[];
  docs: any[];  // Document state after each step
  mapping: number[];  // Position mapping for rebasing
  metadata: TransactionMetadata;
}

/**
 * Operation result with transaction data
 */
export interface OperationResult {
  operation: {
    type: string;
    targetId: string;
    targetPosition: number;
    htmlReference: string;
  };
  transaction: Transaction;
  affectedRange: { from: number; to: number };
  inverseSteps: Step[];  // For undo functionality
}

/**
 * Find the position of a node in the document by its ID
 */
function findNodePositionById(doc: any, nodeId: string, currentPos = 0): number | null {
  if (!doc || !doc.content) return null;

  for (const node of doc.content) {
    // Check if this node matches the ID
    if (node.attrs?.id === nodeId || node.attrs?.["data-node-id"] === nodeId) {
      return currentPos;
    }

    // Recursively search children
    if (node.content) {
      const foundPos = findNodePositionById(node, nodeId, currentPos + 1);
      if (foundPos !== null) return foundPos;
    }

    // Calculate the size of this node
    currentPos += getNodeSize(node);
  }

  return null;
}

/**
 * Calculate the size of a node in the document
 */
function getNodeSize(node: any): number {
  let size = 1; // Node itself

  if (node.content) {
    for (const child of node.content) {
      size += getNodeSize(child);
    }
  }

  if (node.type === "text" && node.text) {
    size = node.text.length;
  }

  return size;
}

/**
 * Parse HTML string to ProseMirror node structure
 */
function parseHTMLToNodes(html: string): any[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<body>${html}</body>`, "text/html");
  if (!doc || !doc.body) return [];

  const nodes: any[] = [];

  for (const child of doc.body.children) {
    const node = domElementToNode(child as Element);
    if (node) nodes.push(node);
  }

  return nodes;
}

/**
 * Convert a DOM element to a ProseMirror node
 */
function domElementToNode(element: Element): any {
  const tagName = element.tagName.toLowerCase();
  const id = element.getAttribute("id");

  switch (tagName) {
    case "p":
      return {
        type: "paragraph",
        attrs: id ? { id } : {},
        content: parseInlineContent(element)
      };

    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6":
      return {
        type: "heading",
        attrs: { level: parseInt(tagName[1]), ...(id ? { id } : {}) },
        content: parseInlineContent(element)
      };

    case "ul":
      return {
        type: "bulletList",
        attrs: id ? { id } : {},
        content: Array.from(element.children).map(li => ({
          type: "listItem",
          content: [{ type: "paragraph", content: parseInlineContent(li as Element) }]
        }))
      };

    case "ol":
      return {
        type: "orderedList",
        attrs: id ? { id } : {},
        content: Array.from(element.children).map(li => ({
          type: "listItem",
          content: [{ type: "paragraph", content: parseInlineContent(li as Element) }]
        }))
      };

    default:
      return {
        type: "paragraph",
        attrs: id ? { id } : {},
        content: parseInlineContent(element)
      };
  }
}

/**
 * Parse inline content from an element
 */
function parseInlineContent(element: Element): any[] {
  const content: any[] = [];

  for (const node of element.childNodes) {
    if (node.nodeType === 3) { // Text node
      const text = node.textContent;
      if (text) {
        content.push({ type: "text", text });
      }
    } else if (node.nodeType === 1) { // Element node
      const el = node as Element;
      const tagName = el.tagName.toLowerCase();

      if (tagName === "strong" || tagName === "b") {
        const innerContent = parseInlineContent(el);
        innerContent.forEach(node => {
          node.marks = [...(node.marks || []), { type: "bold" }];
        });
        content.push(...innerContent);
      } else if (tagName === "em" || tagName === "i") {
        const innerContent = parseInlineContent(el);
        innerContent.forEach(node => {
          node.marks = [...(node.marks || []), { type: "italic" }];
        });
        content.push(...innerContent);
      } else {
        content.push(...parseInlineContent(el));
      }
    }
  }

  return content;
}

/**
 * Generate ProseMirror steps for an insert operation at a specific position
 */
function generateInsertStepsAtPosition(
  position: number,
  htmlContent: string,
  insertBefore: boolean
): Step[] {
  const nodes = parseHTMLToNodes(htmlContent);
  const targetPos = insertBefore ? position : position + 1;

  // Create a ReplaceStep to insert the new content
  const step: ReplaceStep = {
    stepType: "replace",
    from: targetPos,
    to: targetPos,
    slice: {
      content: nodes,
      openStart: 0,
      openEnd: 0
    }
  };

  return [step];
}

/**
 * Generate ProseMirror steps for a replace operation at a specific position
 */
function generateReplaceStepsAtPosition(
  doc: any,
  position: number,
  htmlContent: string
): Step[] {
  const nodes = parseHTMLToNodes(htmlContent);

  // Find the node at this position to get its size
  const targetNode = findNodeAtPosition(doc, position);
  const nodeSize = targetNode ? getNodeSize(targetNode) : 2; // Default block size

  const step: ReplaceStep = {
    stepType: "replace",
    from: position,
    to: position + nodeSize,
    slice: {
      content: nodes,
      openStart: 0,
      openEnd: 0
    }
  };

  return [step];
}

/**
 * Generate ProseMirror steps for a delete operation at a specific position
 */
function generateDeleteStepsAtPosition(doc: any, position: number): Step[] {
  // Find the node at this position to get its size
  const targetNode = findNodeAtPosition(doc, position);
  const nodeSize = targetNode ? getNodeSize(targetNode) : 2; // Default block size

  const step: ReplaceStep = {
    stepType: "replace",
    from: position,
    to: position + nodeSize,
    slice: {
      content: [],
      openStart: 0,
      openEnd: 0
    }
  };

  return [step];
}

/**
 * Find a node at a specific position in the document
 */
function findNodeAtPosition(doc: any, targetPos: number): any | null {
  if (!doc || !doc.content) return null;

  let currentPos = 0;

  for (const node of doc.content) {
    const nodeSize = getNodeSize(node);
    if (currentPos === targetPos) {
      return node;
    }
    if (currentPos + nodeSize > targetPos) {
      // Target position is within this node
      return node;
    }
    currentPos += nodeSize;
  }

  return null;
}

/**
 * Find a node by its ID in the document
 */
function findNodeById(doc: any, nodeId: string): any | null {
  if (!doc || !doc.content) return null;

  for (const node of doc.content) {
    if (node.attrs?.id === nodeId || node.attrs?.["data-node-id"] === nodeId) {
      return node;
    }

    if (node.content) {
      const found = findNodeById(node, nodeId);
      if (found) return found;
    }
  }

  return null;
}

/**
 * Generate inverse steps for undo functionality
 */
function generateInverseSteps(steps: Step[], originalDoc: any): Step[] {
  const inverseSteps: Step[] = [];

  for (const step of steps) {
    if (step.stepType === "replace") {
      const replaceStep = step as ReplaceStep;

      // Get the content that was replaced
      const originalContent = getContentBetween(originalDoc, replaceStep.from, replaceStep.to);

      // Create inverse step that restores original content
      inverseSteps.push({
        stepType: "replace",
        from: replaceStep.from,
        to: replaceStep.from + (replaceStep.slice?.content?.length || 0),
        slice: {
          content: originalContent,
          openStart: 0,
          openEnd: 0
        }
      });
    }
  }

  return inverseSteps.reverse(); // Apply in reverse order
}

/**
 * Get content between two positions in the document
 */
function getContentBetween(doc: any, from: number, to: number): any[] {
  // Simplified implementation - would need full traversal in production
  return [];
}

/**
 * Main function to convert HTML operations to ProseMirror transaction
 */
export function htmlOperationToTransaction(
  originalDoc: any,
  operation: any,
  metadata?: Partial<TransactionMetadata>,
  positionMap?: Map<string, number>
): OperationResult {
  const steps: Step[] = [];
  let targetPosition = 0;

  try {
    // Use position map if available, otherwise fall back to searching
    if (positionMap && positionMap.has(operation.target_id)) {
      targetPosition = positionMap.get(operation.target_id) || 0;
    } else {
      targetPosition = findNodePositionById(originalDoc, operation.target_id) || 0;
    }

    switch (operation.operation) {
      case "insert_after":
        steps.push(...generateInsertStepsAtPosition(
          targetPosition,
          operation.html_to_insert,
          false
        ));
        break;

      case "insert_before":
        steps.push(...generateInsertStepsAtPosition(
          targetPosition,
          operation.html_to_insert,
          true
        ));
        break;

      case "replace":
        steps.push(...generateReplaceStepsAtPosition(
          originalDoc,
          targetPosition,
          operation.html_to_insert
        ));
        break;

      case "delete":
        steps.push(...generateDeleteStepsAtPosition(
          originalDoc,
          targetPosition
        ));
        break;

      default:
        throw new Error(`Unknown operation type: ${operation.operation}`);
    }

    // Generate inverse steps for undo
    const inverseSteps = generateInverseSteps(steps, originalDoc);

    // Calculate affected range
    const affectedRange = {
      from: targetPosition,
      to: targetPosition + (steps[0]?.to || targetPosition) - (steps[0]?.from || targetPosition)
    };

    // Create transaction
    const transaction: Transaction = {
      steps,
      docs: [], // Would be filled with intermediate document states
      mapping: [], // Would be filled with position mappings
      metadata: {
        time: Date.now(),
        origin: "ai-suggestion",
        ...metadata
      }
    };

    return {
      operation: {
        type: operation.operation,
        targetId: operation.target_id,
        targetPosition,
        htmlReference: operation.target_id
      },
      transaction,
      affectedRange,
      inverseSteps
    };
  } catch (error) {
    console.error("Error generating ProseMirror transaction:", error);
    throw error;
  }
}

/**
 * Apply a transaction to a document
 */
export function applyTransaction(doc: any, transaction: Transaction): any {
  // Deep clone the document
  let newDoc = JSON.parse(JSON.stringify(doc));

  // Apply each step
  for (const step of transaction.steps) {
    newDoc = applyStep(newDoc, step);
  }

  return newDoc;
}

/**
 * Apply a single step to a document
 */
function applyStep(doc: any, step: Step): any {
  // This would need a full implementation of ProseMirror's step application
  // For now, returning the doc unchanged
  console.log("Applying step:", step);
  return doc;
}

/**
 * Generate decorations for visualizing changes
 */
export function generateDiffDecorations(
  affectedRange: { from: number; to: number },
  type: "add" | "remove" | "change"
): any[] {
  return [
    {
      from: affectedRange.from,
      to: affectedRange.to,
      type: "decoration",
      attrs: {
        class: `diff-${type}`,
        "data-diff-type": type
      }
    }
  ];
}