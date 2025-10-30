-- Allow AI user to insert messages on behalf of the AI assistant
-- The AI user ID is: 9e33f156-c21d-4234-939f-bc3455e2e5c2

-- Create policy to allow AI user to insert assistant messages
CREATE POLICY "AI user can insert assistant messages" ON public.document_chats
    FOR INSERT
    TO authenticated
    WITH CHECK (
        -- Allow if the user is the AI assistant AND the role is 'assistant'
        user_id = '9e33f156-c21d-4234-939f-bc3455e2e5c2'::uuid
        AND role = 'assistant'
    );
