-- Fix document_chats RLS policies to avoid infinite recursion
-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their document chats" ON public.document_chats;
DROP POLICY IF EXISTS "Users can insert chats for their documents" ON public.document_chats;

-- Create a security definer function to check document ownership
-- This bypasses RLS and prevents infinite recursion
CREATE OR REPLACE FUNCTION public.user_owns_document(doc_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.documents
        WHERE id = doc_id
        AND created_by = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Simpler policies using the security definer function
CREATE POLICY "Users can view their document chats" ON public.document_chats
    FOR SELECT
    USING (user_owns_document(document_id));

CREATE POLICY "Users can insert chats for their documents" ON public.document_chats
    FOR INSERT
    WITH CHECK (
        user_owns_document(document_id)
        AND user_id = auth.uid()
    );
