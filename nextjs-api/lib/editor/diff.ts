// Diff functionality for the diffview component
// Modified from https://github.com/hamflx/prosemirror-diff/blob/master/src/diff.js

import { diff_match_patch } from 'diff-match-patch';
import { Fragment, type Node } from '@tiptap/pm/model';

export const DiffType = {
  Unchanged: 0,
  Deleted: -1,
  Inserted: 1,
};

export const patchDocumentNode = (schema: any, oldNode: Node, newNode: Node) => {
  assertNodeTypeEqual(oldNode, newNode);

  const finalLeftChildren: any[] = [];
  const finalRightChildren: any[] = [];

  const oldChildren = normalizeNodeContent(oldNode);
  const newChildren = normalizeNodeContent(newNode);
  const oldChildLen = oldChildren.length;
  const newChildLen = newChildren.length;
  const minChildLen = Math.min(oldChildLen, newChildLen);

  let left = 0;
  let right = 0;

  for (; left < minChildLen; left++) {
    const oldChild = oldChildren[left];
    const newChild = newChildren[left];
    if (!isNodeEqual(oldChild, newChild)) {
      break;
    }
    finalLeftChildren.push(...ensureArray(oldChild));
  }

  for (; right + left + 1 < minChildLen; right++) {
    const oldChild = oldChildren[oldChildLen - right - 1];
    const newChild = newChildren[newChildLen - right - 1];
    if (!isNodeEqual(oldChild, newChild)) {
      break;
    }
    finalRightChildren.unshift(...ensureArray(oldChild));
  }

  const diffOldChildren = oldChildren.slice(left, oldChildLen - right);
  const diffNewChildren = newChildren.slice(left, newChildLen - right);

  if (diffOldChildren.length && diffNewChildren.length) {
    const matchedNodes = matchNodes(
      schema,
      diffOldChildren,
      diffNewChildren,
    ).sort((a: any, b: any) => b.count - a.count);
    const bestMatch = matchedNodes[0];
    if (bestMatch) {
      const { oldStartIndex, newStartIndex, oldEndIndex, newEndIndex } =
        bestMatch;
      const oldBeforeMatchChildren = diffOldChildren.slice(0, oldStartIndex);
      const newBeforeMatchChildren = diffNewChildren.slice(0, newStartIndex);

      finalLeftChildren.push(
        ...patchRemainNodes(
          schema,
          oldBeforeMatchChildren,
          newBeforeMatchChildren,
        ),
      );
      finalLeftChildren.push(
        ...diffOldChildren.slice(oldStartIndex, oldEndIndex),
      );

      const oldAfterMatchChildren = diffOldChildren.slice(oldEndIndex);
      const newAfterMatchChildren = diffNewChildren.slice(newEndIndex);

      finalRightChildren.unshift(
        ...patchRemainNodes(
          schema,
          oldAfterMatchChildren,
          newAfterMatchChildren,
        ),
      );
    } else {
      finalLeftChildren.push(
        ...patchRemainNodes(schema, diffOldChildren, diffNewChildren),
      );
    }
  } else {
    finalLeftChildren.push(
      ...patchRemainNodes(schema, diffOldChildren, diffNewChildren),
    );
  }

  return createNewNode(oldNode, [...finalLeftChildren, ...finalRightChildren]);
};

const matchNodes = (schema: any, oldChildren: any[], newChildren: any[]) => {
  const matches = [];
  for (
    let oldStartIndex = 0;
    oldStartIndex < oldChildren.length;
    oldStartIndex++
  ) {
    for (
      let newStartIndex = 0;
      newStartIndex < newChildren.length;
      newStartIndex++
    ) {
      let oldEndIndex = oldStartIndex;
      let newEndIndex = newStartIndex;
      let count = 0;
      while (
        oldEndIndex < oldChildren.length &&
        newEndIndex < newChildren.length &&
        isNodeEqual(oldChildren[oldEndIndex], newChildren[newEndIndex])
      ) {
        oldEndIndex++;
        newEndIndex++;
        count++;
      }
      if (count > 0) {
        matches.push({
          oldStartIndex,
          newStartIndex,
          oldEndIndex,
          newEndIndex,
          count,
        });
      }
    }
  }
  return matches;
};

const patchRemainNodes = (schema: any, oldChildren: any[], newChildren: any[]) => {
  const oldTextChildren: any[] = [];
  const newTextChildren: any[] = [];
  const finalChildren: any[] = [];
  let oldIndex = 0;
  let newIndex = 0;

  const flushTextChildren = () => {
    if (oldTextChildren.length || newTextChildren.length) {
      finalChildren.push(
        ...diffTextNodes(
          schema,
          oldTextChildren,
          newTextChildren,
        ),
      );
      oldTextChildren.length = 0;
      newTextChildren.length = 0;
    }
  };

  while (oldIndex < oldChildren.length || newIndex < newChildren.length) {
    const oldChild = oldChildren[oldIndex];
    const newChild = newChildren[newIndex];
    
    if (oldChild?.isText && (!newChild || newChild.isText)) {
      oldTextChildren.push(oldChild);
      oldIndex++;
    } else if (newChild?.isText && (!oldChild || oldChild.isText)) {
      newTextChildren.push(newChild);
      newIndex++;
    } else {
      flushTextChildren();
      
      if (oldChild && !newChild) {
        finalChildren.push(markNodeAsDiff(oldChild, DiffType.Deleted));
        oldIndex++;
      } else if (!oldChild && newChild) {
        finalChildren.push(markNodeAsDiff(newChild, DiffType.Inserted));
        newIndex++;
      } else if (oldChild && newChild) {
        if (oldChild.type.name === newChild.type.name) {
          const patchedNode = patchDocumentNode(schema, oldChild, newChild);
          finalChildren.push(patchedNode);
          oldIndex++;
          newIndex++;
        } else {
          finalChildren.push(markNodeAsDiff(oldChild, DiffType.Deleted));
          finalChildren.push(markNodeAsDiff(newChild, DiffType.Inserted));
          oldIndex++;
          newIndex++;
        }
      }
    }
  }

  flushTextChildren();
  return finalChildren;
};

const diffTextNodes = (schema: any, oldTextNodes: any[], newTextNodes: any[]) => {
  const oldText = oldTextNodes.map(node => node.text).join('');
  const newText = newTextNodes.map(node => node.text).join('');
  
  const dmp = new diff_match_patch();
  const diffs = dmp.diff_main(oldText, newText);
  dmp.diff_cleanupSemantic(diffs);
  
  const finalNodes = [];
  for (const [type, text] of diffs) {
    if (text) {
      const textNode = schema.text(text);
      if (type === -1) {
        finalNodes.push(markNodeAsDiff(textNode, DiffType.Deleted));
      } else if (type === 1) {
        finalNodes.push(markNodeAsDiff(textNode, DiffType.Inserted));
      } else {
        finalNodes.push(textNode);
      }
    }
  }
  
  return finalNodes;
};

const markNodeAsDiff = (node: Node, type: number) => {
  const marks = node.marks.filter((mark: any) => mark.type.name !== 'diff');
  const diffMark = node.type.schema.marks.diff.create({ type });
  return node.mark([...marks, diffMark]);
};

const createNewNode = (oldNode: Node, children: any[]) => {
  if (children.length === 0) {
    return oldNode.type.createAndFill();
  }
  
  const fragment = Fragment.from(children);
  return oldNode.copy(fragment);
};

const normalizeNodeContent = (node: Node) => {
  const children = [];
  node.content.forEach((child: Node) => {
    children.push(child);
  });
  return children;
};

const ensureArray = (item: any) => {
  return Array.isArray(item) ? item : [item];
};

const assertNodeTypeEqual = (oldNode: Node, newNode: Node) => {
  if (oldNode.type.name !== newNode.type.name) {
    throw new Error('Cannot diff nodes of different types');
  }
};

const isNodeEqual = (a: Node, b: Node) => {
  if (!a || !b) return false;
  return a.eq(b);
};

export const diffEditor = patchDocumentNode;