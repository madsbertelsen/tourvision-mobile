-- Fix the auto-apply trigger for AI suggestions
-- This migration ensures the trigger properly fires and applies document changes

-- First, drop the existing trigger if it exists
DROP TRIGGER IF EXISTS auto_apply_approved_suggestions ON public.ai_suggestions;

-- Create an improved function with detailed logging
CREATE OR REPLACE FUNCTION check_and_apply_suggestion()
RETURNS TRIGGER AS $$
DECLARE
  config_record RECORD;
  trip_record RECORD;
  new_version INTEGER;
  required_approvals_count INTEGER;
BEGIN
  -- Log trigger execution
  RAISE LOG 'check_and_apply_suggestion triggered for suggestion %', NEW.id;
  RAISE NOTICE 'Trigger fired: suggestion_id=%, old_approval=%, new_approval=%', NEW.id, OLD.approval_count, NEW.approval_count;

  -- Only process if approval count changed
  IF OLD.approval_count = NEW.approval_count THEN
    RAISE NOTICE 'Approval count unchanged, skipping';
    RETURN NEW;
  END IF;

  -- Skip if already applied or rejected
  IF NEW.status IN ('applied', 'rejected') THEN
    RAISE NOTICE 'Suggestion already %, skipping', NEW.status;
    RETURN NEW;
  END IF;

  -- Get AI config for this trip
  SELECT * INTO config_record
  FROM public.ai_agent_config
  WHERE trip_id = NEW.trip_id;

  -- Determine required approvals
  IF config_record IS NOT NULL AND config_record.required_approvals IS NOT NULL THEN
    required_approvals_count := config_record.required_approvals;
    RAISE NOTICE 'Using config required_approvals: %', required_approvals_count;
  ELSE
    -- Use default if no config or required_approvals is null
    required_approvals_count := 1;
    RAISE NOTICE 'Using default required_approvals: 1';
  END IF;

  -- Check if we have enough approvals
  RAISE NOTICE 'Checking approvals: % >= % (status=%)', NEW.approval_count, required_approvals_count, NEW.status;

  IF NEW.approval_count >= required_approvals_count AND NEW.status = 'pending' THEN
    RAISE NOTICE 'Applying suggestion % to trip %', NEW.id, NEW.trip_id;

    -- Update suggestion status to approved first
    NEW.status := 'approved';
    NEW.approved_at := NOW();

    -- Get current trip document
    SELECT * INTO trip_record FROM public.trips WHERE id = NEW.trip_id;

    IF trip_record IS NULL THEN
      RAISE WARNING 'Trip % not found for suggestion %', NEW.trip_id, NEW.id;
      RETURN NEW;
    END IF;

    -- Calculate new version number
    SELECT COALESCE(MAX(version_number), 0) + 1 INTO new_version
    FROM public.document_history
    WHERE trip_id = NEW.trip_id;

    RAISE NOTICE 'Creating document history version %', new_version;

    -- Save current version to history
    INSERT INTO public.document_history (
      trip_id, version_number, document_content, changed_by,
      change_type, suggestion_id, change_description
    ) VALUES (
      NEW.trip_id, new_version, trip_record.itinerary_document,
      NEW.created_by, 'ai_suggestion', NEW.id, NEW.title
    );

    -- Apply the suggestion to the trip document
    RAISE NOTICE 'Updating trip document with new content';
    UPDATE public.trips
    SET itinerary_document = NEW.proposed_content,
        updated_at = NOW()
    WHERE id = NEW.trip_id;

    -- Mark as applied
    NEW.status := 'applied';
    NEW.applied_at := NOW();

    RAISE NOTICE 'Successfully applied suggestion % to trip %', NEW.id, NEW.trip_id;
  ELSE
    RAISE NOTICE 'Not enough approvals or not pending: approvals=%, required=%, status=%',
                 NEW.approval_count, required_approvals_count, NEW.status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger with correct configuration
CREATE TRIGGER auto_apply_approved_suggestions
  BEFORE UPDATE OF approval_count ON public.ai_suggestions
  FOR EACH ROW
  EXECUTE FUNCTION check_and_apply_suggestion();

-- Add a comment for documentation
COMMENT ON TRIGGER auto_apply_approved_suggestions ON public.ai_suggestions IS
'Automatically applies AI suggestions when they receive enough approvals.
Fires before update of approval_count column, checks required approvals from ai_agent_config,
saves current document to history, and updates the trip document with proposed changes.';

-- Create a helper function to manually test the trigger
CREATE OR REPLACE FUNCTION test_auto_apply_trigger(p_suggestion_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_result TEXT;
  v_suggestion RECORD;
BEGIN
  -- Get the suggestion
  SELECT * INTO v_suggestion
  FROM public.ai_suggestions
  WHERE id = p_suggestion_id;

  IF v_suggestion IS NULL THEN
    RETURN 'Suggestion not found';
  END IF;

  -- Try to increment approval count to trigger the function
  UPDATE public.ai_suggestions
  SET approval_count = approval_count + 1
  WHERE id = p_suggestion_id;

  -- Check the result
  SELECT status INTO v_result
  FROM public.ai_suggestions
  WHERE id = p_suggestion_id;

  RETURN 'Suggestion status after update: ' || v_result;
END;
$$ LANGUAGE plpgsql;

-- Note: To enable verbose logging for debugging, run these commands manually:
-- ALTER SYSTEM SET log_statement = 'all';
-- ALTER SYSTEM SET log_min_messages = 'notice';
-- SELECT pg_reload_conf();