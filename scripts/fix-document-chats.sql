-- Fix document_chats policies (use created_by instead of user_id for documents table)

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
            AND documents.created_by = auth.uid()
        )
    );

-- Users can insert chats for documents they own
CREATE POLICY "Users can insert chats for their documents" ON public.document_chats
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.documents
            WHERE documents.id = document_chats.document_id
            AND documents.created_by = auth.uid()
        )
        AND user_id = auth.uid()
    );

-- Check if the function exists before trying to use it
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
        -- Add updated_at trigger only if it doesn't exist
        IF NOT EXISTS (
            SELECT 1 FROM pg_trigger
            WHERE tgname = 'update_document_chats_updated_at'
        ) THEN
            CREATE TRIGGER update_document_chats_updated_at
                BEFORE UPDATE ON public.document_chats
                FOR EACH ROW
                EXECUTE FUNCTION public.update_updated_at_column();
        END IF;
    END IF;
END $$;

-- Grant success
SELECT 'Policies and triggers created successfully!' as result;