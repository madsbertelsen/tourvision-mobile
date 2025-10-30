-- Migration to create document_chats table
-- Run this in Supabase SQL Editor

-- Create document_chats table for document-specific chat messages
CREATE TABLE IF NOT EXISTS public.document_chats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_document_chats_document_id ON public.document_chats(document_id);
CREATE INDEX IF NOT EXISTS idx_document_chats_user_id ON public.document_chats(user_id);
CREATE INDEX IF NOT EXISTS idx_document_chats_created_at ON public.document_chats(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.document_chats ENABLE ROW LEVEL SECURITY;

-- RLS policies
-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their document chats" ON public.document_chats;
DROP POLICY IF EXISTS "Users can insert chats for their documents" ON public.document_chats;

-- Users can view chats for documents they own
CREATE POLICY "Users can view their document chats" ON public.document_chats
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.documents
            WHERE documents.id = document_chats.document_id
            AND documents.user_id = auth.uid()
        )
    );

-- Users can insert chats for documents they own
CREATE POLICY "Users can insert chats for their documents" ON public.document_chats
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.documents
            WHERE documents.id = document_chats.document_id
            AND documents.user_id = auth.uid()
        )
        AND user_id = auth.uid()
    );

-- Check if the function exists before trying to use it
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
        -- Add updated_at trigger
        CREATE TRIGGER update_document_chats_updated_at
            BEFORE UPDATE ON public.document_chats
            FOR EACH ROW
            EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
END $$;