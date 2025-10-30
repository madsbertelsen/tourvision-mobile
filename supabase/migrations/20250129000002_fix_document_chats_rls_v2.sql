-- Fix document_chats RLS policies to avoid infinite recursion (v2)
-- Drop existing policies and function
DROP POLICY IF EXISTS "Users can view their document chats" ON public.document_chats;
DROP POLICY IF EXISTS "Users can insert chats for their documents" ON public.document_chats;
DROP FUNCTION IF EXISTS public.user_owns_document(UUID);

-- Create a security definer function that completely bypasses RLS
CREATE OR REPLACE FUNCTION public.user_owns_document(doc_id UUID)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    owns BOOLEAN;
BEGIN
    -- Directly check ownership without triggering RLS
    SELECT EXISTS (
        SELECT 1 FROM documents
        WHERE id = doc_id
        AND created_by = auth.uid()
    ) INTO owns;

    RETURN owns;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.user_owns_document(UUID) TO authenticated;

-- Create simpler policies
CREATE POLICY "Users can view their document chats" ON public.document_chats
    FOR SELECT
    TO authenticated
    USING (user_owns_document(document_id));

CREATE POLICY "Users can insert chats for their documents" ON public.document_chats
    FOR INSERT
    TO authenticated
    WITH CHECK (
        user_owns_document(document_id)
        AND user_id = auth.uid()
    );
