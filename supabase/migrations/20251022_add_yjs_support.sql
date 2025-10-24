-- Add Y.js support to documents table
-- This migration adds columns for storing Y.js CRDT state and removes the old itinerary_document

-- Add Y.js state columns
ALTER TABLE public.documents
ADD COLUMN IF NOT EXISTS yjs_state BYTEA,
ADD COLUMN IF NOT EXISTS yjs_clock BIGINT DEFAULT 0;

-- Drop old itinerary_document column (no backward compatibility needed)
ALTER TABLE public.documents
DROP COLUMN IF EXISTS itinerary_document;

-- Create table for incremental Y.js updates
-- This allows efficient sync for clients that are slightly out of date
CREATE TABLE IF NOT EXISTS public.yjs_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  update_data BYTEA NOT NULL,
  clock INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW())
);

-- Index for efficient querying by document and clock
CREATE INDEX IF NOT EXISTS idx_yjs_updates_document_clock
ON public.yjs_updates(document_id, clock);

-- Enable RLS on yjs_updates table
ALTER TABLE public.yjs_updates ENABLE ROW LEVEL SECURITY;

-- Allow users to read yjs_updates for documents they have access to
CREATE POLICY "Users can read yjs_updates for accessible documents"
ON public.yjs_updates FOR SELECT
USING (
  document_id IN (
    SELECT id FROM public.documents
    WHERE created_by = auth.uid()
    OR auth.uid() = ANY(collaborators)
    OR is_public = true
  )
);

-- Allow users to insert yjs_updates for documents they have access to
CREATE POLICY "Users can insert yjs_updates for accessible documents"
ON public.yjs_updates FOR INSERT
WITH CHECK (
  document_id IN (
    SELECT id FROM public.documents
    WHERE created_by = auth.uid()
    OR auth.uid() = ANY(collaborators)
  )
);

-- Add comment explaining the schema
COMMENT ON COLUMN public.documents.yjs_state IS 'Y.js CRDT state as binary data (BYTEA)';
COMMENT ON COLUMN public.documents.yjs_clock IS 'Y.js logical clock for versioning';
COMMENT ON TABLE public.yjs_updates IS 'Incremental Y.js updates for efficient sync';
