#!/usr/bin/env node

// Test that transaction steps are working with correct positions

const fetch = require('node-fetch');

async function testTransactionSteps() {
  console.log('Testing Transaction-based Diff System\n');
  console.log('=====================================\n');

  // 1. Check if we have a proposal with transaction steps
  const supabaseUrl = 'http://127.0.0.1:54321';
  const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/proposals?select=*&order=created_at.desc&limit=1`, {
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`
      }
    });

    const proposals = await response.json();

    if (proposals.length === 0) {
      console.log('❌ No proposals found in database');
      return;
    }

    const proposal = proposals[0];
    console.log('✅ Found proposal:', proposal.id);
    console.log('   Title:', proposal.title);
    console.log('   Has transaction_steps:', !!proposal.transaction_steps);
    console.log('   Has operation_metadata:', !!proposal.operation_metadata);

    if (proposal.transaction_steps && proposal.transaction_steps.length > 0) {
      const step = proposal.transaction_steps[0];
      console.log('\n📄 Transaction Step Details:');
      console.log('   Type:', step.stepType);
      console.log('   From position:', step.from);
      console.log('   To position:', step.to);

      // Check the document size
      if (proposal.current_content) {
        const docSize = calculateDocSize(proposal.current_content);
        console.log('\n📏 Document Analysis:');
        console.log('   Current document size:', docSize);
        console.log('   Step tries to insert at:', step.from);

        if (step.from > docSize) {
          console.log('   ⚠️  WARNING: Position is out of range!');
          console.log('   The step position (' + step.from + ') exceeds document size (' + docSize + ')');
        } else {
          console.log('   ✅ Position is within range');
        }
      }
    }

    // Check for inverse steps
    if (proposal.operation_metadata?.inverseSteps) {
      console.log('\n✅ Inverse steps found for undo functionality');
    }

    console.log('\n=====================================');
    console.log('Summary:');
    if (proposal.transaction_steps && proposal.operation_metadata?.inverseSteps) {
      console.log('✅ Proposal has transaction steps for document transformation');
      console.log('✅ Proposal has inverse steps for undo functionality');
      console.log('✅ System is correctly storing ProseMirror transactions');

      const step = proposal.transaction_steps[0];
      const docSize = proposal.current_content ? calculateDocSize(proposal.current_content) : 0;
      if (step.from > docSize) {
        console.log('❌ BUT: Position calculation needs fixing (step.from=' + step.from + ' > docSize=' + docSize + ')');
      }
    } else {
      console.log('❌ Proposal is missing transaction steps or inverse steps');
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

function calculateDocSize(doc) {
  if (!doc) return 2;

  // Simple calculation - in reality ProseMirror has more complex logic
  let size = 2; // doc node

  if (doc.content) {
    doc.content.forEach(node => {
      size += calculateNodeSize(node);
    });
  }

  return size;
}

function calculateNodeSize(node) {
  if (!node) return 0;
  if (node.type === 'text') return node.text?.length || 0;

  let size = 2; // node boundaries
  if (node.content) {
    node.content.forEach(child => {
      size += calculateNodeSize(child);
    });
  }

  return size;
}

testTransactionSteps();