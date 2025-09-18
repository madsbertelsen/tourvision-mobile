import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.43/deno-dom-wasm.ts";
import { documentToHTMLWithMap, htmlToDocument } from "../_shared/prosemirror-html.ts";
import {
  htmlOperationToTransaction,
  generateDiffDecorations,
  type Transaction,
  type OperationResult
} from "../_shared/prosemirror-steps.ts";
import { createMistral } from "https://esm.sh/@ai-sdk/mistral@0.0.22";
import { generateText } from "https://esm.sh/ai@3.2.0";

const MISTRAL_API_KEY = Deno.env.get("MISTRAL_API_KEY");

async function getAISuggestedChanges(htmlContent: string, userPrompt: string): Promise<{ operation: any; confidence: number; reasoning: string }> {
  const prompt = `You are analyzing an HTML document with unique IDs for precise element targeting.

Current document HTML:
${htmlContent}

Each element has a unique id attribute (e.g., id="node-0", id="node-1", etc.). Use these IDs to specify exactly where to make changes.

User request: ${userPrompt}

Analyze the document and suggest ONE specific change. Return your response as a JSON object with this exact structure:

{
  "operation": "insert_after" | "insert_before" | "replace" | "delete",
  "target_id": "node-X",
  "description": "Brief description of the change",
  "html_to_insert": "<element id='node-new-1'>Content</element>" (for insert/replace operations),
  "reasoning": "Why this change improves the document"
}

IMPORTANT:
- Use target_id to reference the element's ID (e.g., "node-3")
- For new elements, use IDs with 'node-new-' prefix
- Only suggest changes that directly address the user's request
- Ensure HTML is valid and well-formed
- When inserting multiple elements, put them in logical reading order (e.g., heading before paragraph, not after)
- For sections, the heading should come first, followed by content

Return ONLY the JSON object, no other text.`;

  try {
    if (!MISTRAL_API_KEY) {
      throw new Error("MISTRAL_API_KEY not configured");
    }

    // Initialize Mistral client with AI SDK
    const mistral = createMistral({
      apiKey: MISTRAL_API_KEY,
    });

    // Generate text using AI SDK
    const { text } = await generateText({
      model: mistral('mistral-small-latest'),
      prompt,
      temperature: 0.7,
      maxTokens: 1000,
    });

    console.log("AI Response:", text);

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON object found in AI response");
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Extract confidence from reasoning or set default
    const confidence = parsed.confidence || 0.8;
    const reasoning = parsed.reasoning || "No reasoning provided";

    return {
      operation: {
        operation: parsed.operation,
        target_id: parsed.target_id,
        description: parsed.description,
        html_to_insert: parsed.html_to_insert
      },
      confidence,
      reasoning
    };
  } catch (error) {
    console.error("Error getting AI suggestions:", error);
    throw error;
  }
}

function applyHTMLOperation(html: string, operation: any): string {
  // Parse HTML string to manipulate
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<!DOCTYPE html><body>${html}</body>`, "text/html");

  if (!doc || !doc.body) {
    throw new Error("Failed to parse HTML");
  }

  const targetElement = doc.getElementById(operation.target_id);

  if (!targetElement && operation.operation !== 'append') {
    throw new Error(`Target element with id="${operation.target_id}" not found`);
  }

  // Create new elements from HTML string
  const tempDiv = doc.createElement('div');
  if (operation.html_to_insert) {
    tempDiv.innerHTML = operation.html_to_insert;
  }

  switch (operation.operation) {
    case 'insert_after':
      if (targetElement) {
        // Insert all children after the target element, maintaining order
        let insertPoint = targetElement.nextSibling;
        while (tempDiv.firstChild) {
          const nodeToInsert = tempDiv.firstChild;
          if (insertPoint) {
            targetElement.parentNode?.insertBefore(nodeToInsert, insertPoint);
          } else {
            targetElement.parentNode?.appendChild(nodeToInsert);
          }
          // Don't update insertPoint - we want to insert in sequence at the same position
        }
      }
      break;

    case 'insert_before':
      if (targetElement) {
        while (tempDiv.firstChild) {
          targetElement.parentNode?.insertBefore(tempDiv.firstChild, targetElement);
        }
      }
      break;

    case 'replace':
      if (targetElement && tempDiv.firstChild) {
        targetElement.parentNode?.replaceChild(tempDiv.firstChild, targetElement);
      }
      break;

    case 'delete':
      if (targetElement) {
        targetElement.parentNode?.removeChild(targetElement);
      }
      break;

    case 'append':
      // Append to end of document body
      while (tempDiv.firstChild) {
        doc.body.appendChild(tempDiv.firstChild);
      }
      break;

    default:
      throw new Error(`Unknown operation: ${operation.operation}`);
  }

  return doc.body.innerHTML;
}

serve(async (req) => {
  try {
    // Parse request body
    const { document, prompt, operation } = await req.json();

    // If a specific operation is provided, apply it directly
    if (operation) {
      const { html, positionMap } = documentToHTMLWithMap(document);
      const modifiedHtml = applyHTMLOperation(html, operation);
      const modifiedDoc = htmlToDocument(modifiedHtml);

      // Generate transaction with position map
      let transactionResult: OperationResult | null = null;
      try {
        transactionResult = htmlOperationToTransaction(
          document,
          operation,
          {
            userPrompt: "Direct operation",
            aiModel: "none",
            aiConfidence: 1.0,
            aiReasoning: "User-provided operation"
          },
          positionMap.idToPos
        );
      } catch (error) {
        console.error("Error generating transaction:", error);
      }

      return new Response(
        JSON.stringify({
          success: true,
          originalHtml: html,
          modifiedHtml,
          originalDocument: document,
          modifiedDocument: modifiedDoc,
          operation,
          // Include transaction data if available
          transaction: transactionResult?.transaction || null,
          transactionSteps: transactionResult?.transaction.steps || null,
          inverseSteps: transactionResult?.inverseSteps || null,
          affectedRange: transactionResult?.affectedRange || null
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 200
        }
      );
    }

    // Otherwise, use AI to suggest changes
    if (!document || !prompt) {
      return new Response(
        JSON.stringify({ error: "Missing document or prompt" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    if (!MISTRAL_API_KEY) {
      return new Response(
        JSON.stringify({ error: "MISTRAL_API_KEY not configured" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    // Convert document to HTML with IDs and position mapping
    const { html, positionMap } = documentToHTMLWithMap(document);
    console.log("Generated HTML with IDs:", html);
    console.log("Position map size:", positionMap.idToPos.size);

    // Get AI suggestions
    const startTime = Date.now();
    const { operation: suggestedOperation, confidence, reasoning } = await getAISuggestedChanges(html, prompt);
    const processingTime = Date.now() - startTime;
    console.log("AI suggested operation:", suggestedOperation);
    console.log("AI confidence:", confidence);

    // Apply the suggested operation
    const modifiedHtml = applyHTMLOperation(html, suggestedOperation);

    // Convert back to ProseMirror document
    const modifiedDoc = htmlToDocument(modifiedHtml);

    // Generate ProseMirror transaction data
    let transactionResult: OperationResult | null = null;
    try {
      transactionResult = htmlOperationToTransaction(
        document,
        suggestedOperation,
        {
          userPrompt: prompt,
          aiModel: "mistral-small-latest",
          aiConfidence: confidence,
          aiReasoning: reasoning
        },
        positionMap.idToPos  // Pass the position map
      );
      console.log("Generated transaction with", transactionResult.transaction.steps.length, "steps");
    } catch (error) {
      console.error("Error generating transaction:", error);
      // Continue without transaction data if generation fails
    }

    // Generate diff decorations
    const diffDecorations = transactionResult
      ? generateDiffDecorations(transactionResult.affectedRange, "add")
      : [];

    return new Response(
      JSON.stringify({
        success: true,
        originalHtml: html,
        modifiedHtml,
        originalDocument: document,
        modifiedDocument: modifiedDoc,
        operation: suggestedOperation,
        // New transaction data
        transaction: transactionResult?.transaction || null,
        transactionSteps: transactionResult?.transaction.steps || null,
        inverseSteps: transactionResult?.inverseSteps || null,
        affectedRange: transactionResult?.affectedRange || null,
        diffDecorations,
        // Metadata
        metadata: {
          aiConfidence: confidence,
          aiReasoning: reasoning,
          processingTimeMs: processingTime,
          aiModel: "mistral-small-latest",
          userPrompt: prompt,
          timestamp: Date.now()
        }
      }),
      {
        headers: { "Content-Type": "application/json" },
        status: 200
      }
    );

  } catch (error) {
    console.error("Error processing document:", error);

    return new Response(
      JSON.stringify({
        error: error.message,
        stack: error.stack
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
});