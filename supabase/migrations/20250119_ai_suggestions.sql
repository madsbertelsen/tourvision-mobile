-- Create AI suggestions table for tracking proposed document changes
CREATE TABLE IF NOT EXISTS public.ai_suggestions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, -- The AI agent user
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  -- Suggestion details
  suggestion_type TEXT NOT NULL CHECK (suggestion_type IN ('add', 'modify', 'remove', 'reorganize')),
  title TEXT NOT NULL,
  description TEXT,

  -- The actual changes in TipTap JSON format
  current_content JSONB, -- Current state of affected section
  proposed_content JSONB NOT NULL, -- Proposed new state

  -- AI reasoning and context
  chat_context TEXT[], -- Recent chat messages that led to this suggestion
  ai_reasoning TEXT, -- Explanation of why this change was suggested

  -- Status tracking
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'applied')),
  approved_at TIMESTAMP WITH TIME ZONE,
  applied_at TIMESTAMP WITH TIME ZONE,
  rejected_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,

  -- Voting summary
  approval_count INTEGER DEFAULT 0,
  rejection_count INTEGER DEFAULT 0,
  required_approvals INTEGER DEFAULT 1 -- Can be configured per trip
);

-- Create suggestion votes table for collaborative approval
CREATE TABLE IF NOT EXISTS public.suggestion_votes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  suggestion_id UUID NOT NULL REFERENCES public.ai_suggestions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vote TEXT NOT NULL CHECK (vote IN ('approve', 'reject')),
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  -- Ensure one vote per user per suggestion
  UNIQUE(suggestion_id, user_id)
);

-- Create document history table for version tracking
CREATE TABLE IF NOT EXISTS public.document_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  document_content JSONB NOT NULL,
  changed_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  change_type TEXT NOT NULL CHECK (change_type IN ('manual', 'ai_suggestion', 'rollback')),
  suggestion_id UUID REFERENCES public.ai_suggestions(id) ON DELETE SET NULL,
  change_description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  -- Ensure unique version numbers per trip
  UNIQUE(trip_id, version_number)
);

-- Create AI agent configuration table
CREATE TABLE IF NOT EXISTS public.ai_agent_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,

  -- AI behavior settings
  auto_suggest BOOLEAN DEFAULT true,
  suggestion_threshold INTEGER DEFAULT 2, -- Min number of users discussing before AI suggests
  required_approvals INTEGER DEFAULT 1, -- Number of approvals needed

  -- AI model preferences
  model_provider TEXT DEFAULT 'openai' CHECK (model_provider IN ('openai', 'anthropic')),
  model_name TEXT DEFAULT 'gpt-4',
  temperature DECIMAL(3,2) DEFAULT 0.7,

  -- Prompt customization
  custom_instructions TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(trip_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_trip_id ON public.ai_suggestions(trip_id);
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_status ON public.ai_suggestions(status);
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_created_at ON public.ai_suggestions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_suggestion_votes_suggestion_id ON public.suggestion_votes(suggestion_id);
CREATE INDEX IF NOT EXISTS idx_document_history_trip_id ON public.document_history(trip_id, version_number DESC);

-- Enable RLS
ALTER TABLE public.ai_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suggestion_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_config ENABLE ROW LEVEL SECURITY;

-- RLS Policies for AI Suggestions
-- Users can view suggestions for trips they have access to
CREATE POLICY "Users can view AI suggestions" ON public.ai_suggestions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.trips
      WHERE trips.id = ai_suggestions.trip_id
      AND (
        trips.created_by = auth.uid()
        OR trips.is_public = true
        OR auth.uid() = ANY(trips.collaborators)
      )
    )
  );

-- AI agent can create suggestions
CREATE POLICY "AI can create suggestions" ON public.ai_suggestions
  FOR INSERT
  WITH CHECK (
    auth.uid() = created_by
    AND EXISTS (
      SELECT 1 FROM public.trips
      WHERE trips.id = ai_suggestions.trip_id
    )
  );

-- AI agent can update its own suggestions
CREATE POLICY "AI can update suggestions" ON public.ai_suggestions
  FOR UPDATE
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

-- RLS Policies for Suggestion Votes
-- Users can view votes on suggestions they can see
CREATE POLICY "Users can view votes" ON public.suggestion_votes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.ai_suggestions s
      JOIN public.trips t ON t.id = s.trip_id
      WHERE s.id = suggestion_votes.suggestion_id
      AND (
        t.created_by = auth.uid()
        OR t.is_public = true
        OR auth.uid() = ANY(t.collaborators)
      )
    )
  );

-- Users can vote on suggestions for their trips
CREATE POLICY "Users can create votes" ON public.suggestion_votes
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.ai_suggestions s
      JOIN public.trips t ON t.id = s.trip_id
      WHERE s.id = suggestion_votes.suggestion_id
      AND (
        t.created_by = auth.uid()
        OR auth.uid() = ANY(t.collaborators)
      )
    )
  );

-- Users can update their own votes
CREATE POLICY "Users can update own votes" ON public.suggestion_votes
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for Document History
-- Users can view history for trips they have access to
CREATE POLICY "Users can view document history" ON public.document_history
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.trips
      WHERE trips.id = document_history.trip_id
      AND (
        trips.created_by = auth.uid()
        OR trips.is_public = true
        OR auth.uid() = ANY(trips.collaborators)
      )
    )
  );

-- Only AI and trip owners can add history entries
CREATE POLICY "Authorized users can add history" ON public.document_history
  FOR INSERT
  WITH CHECK (
    auth.uid() = changed_by
    AND EXISTS (
      SELECT 1 FROM public.trips
      WHERE trips.id = document_history.trip_id
      AND (trips.created_by = auth.uid() OR auth.uid() = changed_by)
    )
  );

-- RLS Policies for AI Agent Config
-- Users can view config for their trips
CREATE POLICY "Users can view AI config" ON public.ai_agent_config
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.trips
      WHERE trips.id = ai_agent_config.trip_id
      AND (
        trips.created_by = auth.uid()
        OR auth.uid() = ANY(trips.collaborators)
      )
    )
  );

-- Only trip owners can modify AI config
CREATE POLICY "Owners can manage AI config" ON public.ai_agent_config
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.trips
      WHERE trips.id = ai_agent_config.trip_id
      AND trips.created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.trips
      WHERE trips.id = ai_agent_config.trip_id
      AND trips.created_by = auth.uid()
    )
  );

-- Function to update approval counts when votes change
CREATE OR REPLACE FUNCTION update_suggestion_approval_counts()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.ai_suggestions
  SET
    approval_count = (
      SELECT COUNT(*) FROM public.suggestion_votes
      WHERE suggestion_id = COALESCE(NEW.suggestion_id, OLD.suggestion_id)
      AND vote = 'approve'
    ),
    rejection_count = (
      SELECT COUNT(*) FROM public.suggestion_votes
      WHERE suggestion_id = COALESCE(NEW.suggestion_id, OLD.suggestion_id)
      AND vote = 'reject'
    )
  WHERE id = COALESCE(NEW.suggestion_id, OLD.suggestion_id);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create trigger for vote count updates
CREATE TRIGGER update_suggestion_counts
AFTER INSERT OR UPDATE OR DELETE ON public.suggestion_votes
FOR EACH ROW
EXECUTE FUNCTION update_suggestion_approval_counts();

-- Function to automatically apply approved suggestions
CREATE OR REPLACE FUNCTION check_and_apply_suggestion()
RETURNS TRIGGER AS $$
DECLARE
  config_record RECORD;
  trip_record RECORD;
  new_version INTEGER;
BEGIN
  -- Only process if approval count changed
  IF OLD.approval_count = NEW.approval_count THEN
    RETURN NEW;
  END IF;

  -- Get AI config for this trip
  SELECT * INTO config_record
  FROM public.ai_agent_config
  WHERE trip_id = NEW.trip_id;

  -- Use default if no config
  IF config_record IS NULL THEN
    config_record := ROW(NULL, NEW.trip_id, true, 2, 1, 'openai', 'gpt-4', 0.7, NULL, NOW(), NOW());
  END IF;

  -- Check if we have enough approvals
  IF NEW.approval_count >= config_record.required_approvals AND NEW.status = 'pending' THEN
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

-- Create trigger to auto-apply approved suggestions
CREATE TRIGGER auto_apply_approved_suggestions
BEFORE UPDATE OF approval_count ON public.ai_suggestions
FOR EACH ROW
EXECUTE FUNCTION check_and_apply_suggestion();