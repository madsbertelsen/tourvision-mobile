-- Fix the check_and_apply_suggestion trigger to properly handle NULL config
CREATE OR REPLACE FUNCTION check_and_apply_suggestion()
RETURNS TRIGGER AS $$
DECLARE
  config_record RECORD;
  trip_record RECORD;
  new_version INTEGER;
  required_approvals_count INTEGER;
BEGIN
  -- Only process if approval count changed
  IF OLD.approval_count = NEW.approval_count THEN
    RETURN NEW;
  END IF;

  -- Get AI config for this trip
  SELECT * INTO config_record
  FROM public.ai_agent_config
  WHERE trip_id = NEW.trip_id;

  -- Determine required approvals
  IF config_record IS NOT NULL AND config_record.required_approvals IS NOT NULL THEN
    required_approvals_count := config_record.required_approvals;
  ELSE
    -- Use default if no config or required_approvals is null
    required_approvals_count := 1;
  END IF;

  -- Check if we have enough approvals
  IF NEW.approval_count >= required_approvals_count AND NEW.status = 'pending' THEN
    -- Update suggestion status
    NEW.status := 'approved';
    NEW.approved_at := NOW();

    -- Get current trip document
    SELECT * INTO trip_record FROM public.trips WHERE id = NEW.trip_id;

    -- Calculate new version number
    SELECT COALESCE(MAX(version_number), 0) + 1 INTO new_version
    FROM public.document_history
    WHERE trip_id = NEW.trip_id;

    -- Save current version to history
    INSERT INTO public.document_history (
      trip_id, version_number, document_content, changed_by,
      change_type, suggestion_id, change_description
    ) VALUES (
      NEW.trip_id, new_version, trip_record.itinerary_document,
      NEW.created_by, 'ai_suggestion', NEW.id, NEW.title
    );

    -- Apply the suggestion to the trip document
    UPDATE public.trips
    SET itinerary_document = NEW.proposed_content
    WHERE id = NEW.trip_id;

    -- Mark as applied
    NEW.status := 'applied';
    NEW.applied_at := NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;