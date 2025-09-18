-- Rename AI suggestions to Proposals for better terminology
-- This migration renames all suggestion-related tables, columns, and functions

-- 1. Rename the main table
ALTER TABLE public.ai_suggestions RENAME TO proposals;

-- 2. Rename columns in the proposals table
ALTER TABLE public.proposals RENAME COLUMN proposal_type TO proposal_type;

-- 3. Rename the votes table
ALTER TABLE public.suggestion_votes RENAME TO proposal_votes;

-- 4. Rename column in votes table
ALTER TABLE public.proposal_votes RENAME COLUMN suggestion_id TO proposal_id;

-- 5. Update constraint names for proposals table
ALTER TABLE public.proposals
  DROP CONSTRAINT IF EXISTS ai_suggestions_pkey,
  ADD CONSTRAINT proposals_pkey PRIMARY KEY (id);

ALTER TABLE public.proposals
  DROP CONSTRAINT IF EXISTS ai_suggestions_trip_id_fkey,
  ADD CONSTRAINT proposals_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;

ALTER TABLE public.proposals
  DROP CONSTRAINT IF EXISTS ai_suggestions_created_by_fkey,
  ADD CONSTRAINT proposals_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 6. Update constraint names for proposal_votes table
ALTER TABLE public.proposal_votes
  DROP CONSTRAINT IF EXISTS suggestion_votes_pkey,
  ADD CONSTRAINT proposal_votes_pkey PRIMARY KEY (id);

ALTER TABLE public.proposal_votes
  DROP CONSTRAINT IF EXISTS suggestion_votes_suggestion_id_fkey,
  ADD CONSTRAINT proposal_votes_proposal_id_fkey FOREIGN KEY (proposal_id) REFERENCES public.proposals(id) ON DELETE CASCADE;

ALTER TABLE public.proposal_votes
  DROP CONSTRAINT IF EXISTS suggestion_votes_user_id_fkey,
  ADD CONSTRAINT proposal_votes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.proposal_votes
  DROP CONSTRAINT IF EXISTS suggestion_votes_suggestion_id_user_id_key,
  ADD CONSTRAINT proposal_votes_proposal_id_user_id_key UNIQUE (proposal_id, user_id);

-- 7. Rename indexes
DROP INDEX IF EXISTS idx_ai_suggestions_trip_id;
CREATE INDEX idx_proposals_trip_id ON public.proposals(trip_id);

DROP INDEX IF EXISTS idx_ai_suggestions_status;
CREATE INDEX idx_proposals_status ON public.proposals(status);

DROP INDEX IF EXISTS idx_ai_suggestions_created_at;
CREATE INDEX idx_proposals_created_at ON public.proposals(created_at DESC);

DROP INDEX IF EXISTS idx_ai_suggestions_source_message_id;
CREATE INDEX idx_proposals_source_message_id ON public.proposals(source_message_id);

DROP INDEX IF EXISTS idx_suggestion_votes_suggestion_id;
CREATE INDEX idx_proposal_votes_proposal_id ON public.proposal_votes(proposal_id);

DROP INDEX IF EXISTS idx_suggestion_votes_user_id;
CREATE INDEX idx_proposal_votes_user_id ON public.proposal_votes(user_id);

-- 8. Update the trigger function for vote counting
CREATE OR REPLACE FUNCTION update_proposal_counts()
RETURNS TRIGGER AS $$
BEGIN
  -- Update approval and rejection counts
  UPDATE public.proposals
  SET
    approval_count = (
      SELECT COUNT(*) FROM public.proposal_votes
      WHERE proposal_id = COALESCE(NEW.proposal_id, OLD.proposal_id)
      AND vote = 'approve'
    ),
    rejection_count = (
      SELECT COUNT(*) FROM public.proposal_votes
      WHERE proposal_id = COALESCE(NEW.proposal_id, OLD.proposal_id)
      AND vote = 'reject'
    )
  WHERE id = COALESCE(NEW.proposal_id, OLD.proposal_id);

  -- Check if status should be updated to approved
  UPDATE public.proposals
  SET status = CASE
    WHEN approval_count >= required_approvals AND status = 'pending' THEN 'approved'
    WHEN rejection_count >= (
      SELECT COUNT(DISTINCT tc.user_id) / 2
      FROM public.trip_collaborators tc
      WHERE tc.trip_id = proposals.trip_id
        AND tc.status = 'active'
    ) AND status = 'pending' THEN 'rejected'
    ELSE status
  END
  WHERE id = COALESCE(NEW.proposal_id, OLD.proposal_id);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- 9. Update trigger to use new function name
DROP TRIGGER IF EXISTS update_suggestion_counts ON public.suggestion_votes;
DROP TRIGGER IF EXISTS update_suggestion_counts ON public.proposal_votes;
CREATE TRIGGER update_proposal_counts
AFTER INSERT OR UPDATE OR DELETE ON public.proposal_votes
FOR EACH ROW EXECUTE FUNCTION update_proposal_counts();

-- 10. Update the auto-apply trigger function
CREATE OR REPLACE FUNCTION auto_apply_approved_proposals()
RETURNS TRIGGER AS $$
DECLARE
  v_trip_record RECORD;
  v_updated_document JSONB;
  v_change_location JSONB;
BEGIN
  -- Only proceed if status changed to 'approved' and it's not already applied
  IF NEW.status = 'approved' AND OLD.status = 'pending' AND NEW.applied_at IS NULL THEN
    -- Get the trip document
    SELECT * INTO v_trip_record FROM public.trips WHERE id = NEW.trip_id;

    IF v_trip_record.itinerary_document IS NOT NULL AND NEW.content_changes IS NOT NULL THEN
      -- Initialize the updated document
      v_updated_document := v_trip_record.itinerary_document;

      -- Parse the location information
      v_change_location := NEW.content_changes->'location';

      -- Apply changes based on the request type and location
      CASE NEW.proposal_type
        WHEN 'add' THEN
          -- Add new content at specified location
          IF v_change_location->>'type' = 'destination' THEN
            -- Add a new destination to the destinations array
            v_updated_document := jsonb_set(
              v_updated_document,
              '{content}',
              COALESCE(v_updated_document->'content', '[]'::jsonb) ||
              jsonb_build_array(NEW.content_changes->'content')
            );
          ELSIF v_change_location->>'type' = 'day' THEN
            -- Add content within a specific day
            -- This would require more complex path building based on the day_id
            v_updated_document := v_updated_document; -- Placeholder for complex insertion
          END IF;

        WHEN 'modify' THEN
          -- Modify existing content
          IF v_change_location->>'path' IS NOT NULL THEN
            v_updated_document := jsonb_set(
              v_updated_document,
              string_to_array(v_change_location->>'path', '.'),
              NEW.content_changes->'content',
              false
            );
          END IF;

        WHEN 'remove' THEN
          -- Remove content at specified path
          IF v_change_location->>'path' IS NOT NULL THEN
            v_updated_document := v_updated_document #- string_to_array(v_change_location->>'path', '.');
          END IF;

        WHEN 'reorganize' THEN
          -- Apply reorganization changes (this might involve multiple operations)
          v_updated_document := NEW.content_changes->'content';

        ELSE
          -- Unknown request type, don't apply
          RETURN NEW;
      END CASE;

      -- Update the trip document
      UPDATE public.trips
      SET
        itinerary_document = v_updated_document,
        updated_at = NOW()
      WHERE id = NEW.trip_id;

      -- Mark the change request as applied
      NEW.applied_at := NOW();
      NEW.applied_by := auth.uid();
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 11. Update trigger for auto-apply
DROP TRIGGER IF EXISTS auto_apply_approved_suggestions ON public.ai_suggestions;
DROP TRIGGER IF EXISTS auto_apply_approved_suggestions ON public.proposals;
CREATE TRIGGER auto_apply_approved_proposals
  BEFORE UPDATE OF approval_count ON public.proposals
  FOR EACH ROW
  EXECUTE FUNCTION auto_apply_approved_proposals();

-- 12. Update RLS policies
DROP POLICY IF EXISTS "Users can view AI suggestions" ON public.ai_suggestions;
DROP POLICY IF EXISTS "AI can create suggestions" ON public.ai_suggestions;
DROP POLICY IF EXISTS "AI can update suggestions" ON public.ai_suggestions;

CREATE POLICY "Users can view change requests" ON public.proposals
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.trips
      WHERE trips.id = proposals.trip_id
      AND (
        trips.user_id = auth.uid() OR
        trips.visibility = 'public' OR
        EXISTS (
          SELECT 1 FROM public.trip_collaborators tc
          WHERE tc.trip_id = trips.id AND tc.user_id = auth.uid() AND tc.status = 'active'
        )
      )
    )
  );

CREATE POLICY "AI can create change requests" ON public.proposals
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.trips
      WHERE trips.id = proposals.trip_id
    )
  );

CREATE POLICY "AI can update change requests" ON public.proposals
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- 13. Update votes policies
DROP POLICY IF EXISTS "Users can view votes" ON public.suggestion_votes;
DROP POLICY IF EXISTS "Users can create votes" ON public.suggestion_votes;
DROP POLICY IF EXISTS "Users can update own votes" ON public.suggestion_votes;
DROP POLICY IF EXISTS "Users can view votes for accessible suggestions" ON public.suggestion_votes;
DROP POLICY IF EXISTS "Users can insert their own votes" ON public.suggestion_votes;
DROP POLICY IF EXISTS "Users can update their own votes" ON public.suggestion_votes;
DROP POLICY IF EXISTS "Users can delete their own votes" ON public.suggestion_votes;

CREATE POLICY "Users can view votes" ON public.proposal_votes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.proposals cr
      JOIN public.trips t ON t.id = cr.trip_id
      WHERE cr.id = proposal_votes.proposal_id
      AND (
        t.user_id = auth.uid() OR
        t.visibility = 'public' OR
        EXISTS (
          SELECT 1 FROM public.trip_collaborators tc
          WHERE tc.trip_id = t.id AND tc.user_id = auth.uid() AND tc.status = 'active'
        )
      )
    )
  );

CREATE POLICY "Users can create votes" ON public.proposal_votes
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM public.proposals cr
      JOIN public.trips t ON t.id = cr.trip_id
      WHERE cr.id = proposal_votes.proposal_id
      AND (
        t.user_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM public.trip_collaborators tc
          WHERE tc.trip_id = t.id AND tc.user_id = auth.uid() AND tc.status = 'active'
        )
      )
    )
  );

CREATE POLICY "Users can update own votes" ON public.proposal_votes
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own votes" ON public.proposal_votes
  FOR DELETE
  USING (auth.uid() = user_id);

-- 14. Update trip_chat_messages to reference proposal_id
ALTER TABLE public.trip_chat_messages
  RENAME COLUMN suggestion_id TO proposal_id;

ALTER TABLE public.trip_chat_messages
  DROP CONSTRAINT IF EXISTS trip_chat_messages_suggestion_id_fkey,
  ADD CONSTRAINT trip_chat_messages_proposal_id_fkey
  FOREIGN KEY (proposal_id) REFERENCES public.proposals(id) ON DELETE SET NULL;

-- 15. Update comments for clarity
COMMENT ON TABLE public.proposals IS 'Stores change requests (formerly AI suggestions) for collaborative trip planning';
COMMENT ON TABLE public.proposal_votes IS 'Tracks user votes on change requests';
COMMENT ON COLUMN public.proposals.proposal_type IS 'Type of change request: add, modify, remove, or reorganize';
COMMENT ON COLUMN public.proposals.source_message_id IS 'The chat message that triggered this change request';
COMMENT ON TRIGGER auto_apply_approved_proposals ON public.proposals IS 'Automatically applies approved change requests to the trip document';