-- Migration: Add collaboration proposals tables
-- Description: Support for alternative itinerary suggestions and group split alternatives

-- Create enum for proposal status
CREATE TYPE proposal_status AS ENUM ('pending', 'accepted', 'rejected', 'partially_merged');

-- Table for alternative itinerary proposals
CREATE TABLE IF NOT EXISTS public.itinerary_proposals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  day_index INTEGER NOT NULL,
  proposed_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  original_document JSONB NOT NULL,  -- Snapshot of current day's itinerary
  proposed_document JSONB NOT NULL,  -- Alternative version
  status proposal_status DEFAULT 'pending',
  merge_details JSONB,  -- Track what was cherry-picked if partially merged
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID REFERENCES auth.users(id),
  
  -- Ensure day_index is valid
  CONSTRAINT valid_day_index CHECK (day_index >= 0)
);

-- Comments/discussion on proposals
CREATE TABLE IF NOT EXISTS public.proposal_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  proposal_id UUID NOT NULL REFERENCES public.itinerary_proposals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  comment TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Votes on proposals (for democratic decision making)
CREATE TABLE IF NOT EXISTS public.proposal_votes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  proposal_id UUID NOT NULL REFERENCES public.itinerary_proposals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vote_type TEXT CHECK (vote_type IN ('approve', 'reject', 'neutral')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- One vote per user per proposal
  CONSTRAINT unique_user_vote UNIQUE(proposal_id, user_id)
);

-- Table for group split alternative routes
CREATE TABLE IF NOT EXISTS public.split_group_alternatives (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  split_id TEXT NOT NULL,  -- References the splitId in the document
  group_id TEXT NOT NULL,  -- References the groupId within the split
  suggested_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  route_document JSONB NOT NULL,  -- Alternative route for this group
  estimated_cost DECIMAL(10, 2),
  estimated_duration INTEGER,  -- in minutes
  status proposal_status DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID REFERENCES auth.users(id)
);

-- Votes for split group alternatives
CREATE TABLE IF NOT EXISTS public.split_alternative_votes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  alternative_id UUID NOT NULL REFERENCES public.split_group_alternatives(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- One vote per user per alternative
  CONSTRAINT unique_user_alternative_vote UNIQUE(alternative_id, user_id)
);

-- Indexes for better query performance
CREATE INDEX idx_proposals_trip_id ON public.itinerary_proposals(trip_id);
CREATE INDEX idx_proposals_status ON public.itinerary_proposals(status);
CREATE INDEX idx_proposals_proposed_by ON public.itinerary_proposals(proposed_by);
CREATE INDEX idx_proposal_comments_proposal_id ON public.proposal_comments(proposal_id);
CREATE INDEX idx_proposal_votes_proposal_id ON public.proposal_votes(proposal_id);
CREATE INDEX idx_split_alternatives_trip_id ON public.split_group_alternatives(trip_id);
CREATE INDEX idx_split_alternatives_split_id ON public.split_group_alternatives(split_id);
CREATE INDEX idx_split_alternative_votes_alternative_id ON public.split_alternative_votes(alternative_id);

-- Enable RLS
ALTER TABLE public.itinerary_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.split_group_alternatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.split_alternative_votes ENABLE ROW LEVEL SECURITY;

-- RLS Policies for itinerary_proposals
CREATE POLICY "Collaborators can view proposals for their trips"
  ON public.itinerary_proposals FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.trips 
      WHERE id = itinerary_proposals.trip_id 
      AND (auth.uid() = created_by OR auth.uid() = ANY(collaborators))
    )
  );

CREATE POLICY "Collaborators can create proposals"
  ON public.itinerary_proposals FOR INSERT
  WITH CHECK (
    auth.uid() = proposed_by AND
    EXISTS (
      SELECT 1 FROM public.trips 
      WHERE id = trip_id 
      AND auth.uid() = ANY(collaborators)
    )
  );

CREATE POLICY "Proposers can update their pending proposals"
  ON public.itinerary_proposals FOR UPDATE
  USING (auth.uid() = proposed_by AND status = 'pending')
  WITH CHECK (auth.uid() = proposed_by);

CREATE POLICY "Trip owners can resolve proposals"
  ON public.itinerary_proposals FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.trips 
      WHERE id = itinerary_proposals.trip_id 
      AND auth.uid() = created_by
    )
  );

-- RLS Policies for proposal_comments
CREATE POLICY "Collaborators can view comments"
  ON public.proposal_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.itinerary_proposals p
      JOIN public.trips t ON t.id = p.trip_id
      WHERE p.id = proposal_comments.proposal_id
      AND (auth.uid() = t.created_by OR auth.uid() = ANY(t.collaborators))
    )
  );

CREATE POLICY "Collaborators can add comments"
  ON public.proposal_comments FOR INSERT
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM public.itinerary_proposals p
      JOIN public.trips t ON t.id = p.trip_id
      WHERE p.id = proposal_id
      AND (auth.uid() = t.created_by OR auth.uid() = ANY(t.collaborators))
    )
  );

CREATE POLICY "Users can update their own comments"
  ON public.proposal_comments FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own comments"
  ON public.proposal_comments FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for proposal_votes
CREATE POLICY "Collaborators can view votes"
  ON public.proposal_votes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.itinerary_proposals p
      JOIN public.trips t ON t.id = p.trip_id
      WHERE p.id = proposal_votes.proposal_id
      AND (auth.uid() = t.created_by OR auth.uid() = ANY(t.collaborators))
    )
  );

CREATE POLICY "Collaborators can vote"
  ON public.proposal_votes FOR INSERT
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM public.itinerary_proposals p
      JOIN public.trips t ON t.id = p.trip_id
      WHERE p.id = proposal_id
      AND (auth.uid() = t.created_by OR auth.uid() = ANY(t.collaborators))
    )
  );

CREATE POLICY "Users can change their vote"
  ON public.proposal_votes FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for split_group_alternatives
CREATE POLICY "Collaborators can view split alternatives"
  ON public.split_group_alternatives FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.trips 
      WHERE id = split_group_alternatives.trip_id 
      AND (auth.uid() = created_by OR auth.uid() = ANY(collaborators))
    )
  );

CREATE POLICY "Collaborators can suggest alternatives"
  ON public.split_group_alternatives FOR INSERT
  WITH CHECK (
    auth.uid() = suggested_by AND
    EXISTS (
      SELECT 1 FROM public.trips 
      WHERE id = trip_id 
      AND auth.uid() = ANY(collaborators)
    )
  );

CREATE POLICY "Suggesters can update pending alternatives"
  ON public.split_group_alternatives FOR UPDATE
  USING (auth.uid() = suggested_by AND status = 'pending')
  WITH CHECK (auth.uid() = suggested_by);

-- RLS Policies for split_alternative_votes
CREATE POLICY "Group members can view votes"
  ON public.split_alternative_votes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.split_group_alternatives a
      JOIN public.trips t ON t.id = a.trip_id
      WHERE a.id = split_alternative_votes.alternative_id
      AND (auth.uid() = t.created_by OR auth.uid() = ANY(t.collaborators))
    )
  );

CREATE POLICY "Group members can vote"
  ON public.split_alternative_votes FOR INSERT
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM public.split_group_alternatives a
      JOIN public.trips t ON t.id = a.trip_id
      WHERE a.id = alternative_id
      AND (auth.uid() = t.created_by OR auth.uid() = ANY(t.collaborators))
    )
  );

-- Function to auto-update updated_at
CREATE TRIGGER update_proposal_comments_updated_at 
  BEFORE UPDATE ON public.proposal_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to get proposal statistics
CREATE OR REPLACE FUNCTION get_proposal_stats(proposal_uuid UUID)
RETURNS TABLE (
  total_votes BIGINT,
  approve_votes BIGINT,
  reject_votes BIGINT,
  neutral_votes BIGINT,
  comment_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(DISTINCT v.id) as total_votes,
    COUNT(DISTINCT v.id) FILTER (WHERE v.vote_type = 'approve') as approve_votes,
    COUNT(DISTINCT v.id) FILTER (WHERE v.vote_type = 'reject') as reject_votes,
    COUNT(DISTINCT v.id) FILTER (WHERE v.vote_type = 'neutral') as neutral_votes,
    COUNT(DISTINCT c.id) as comment_count
  FROM public.itinerary_proposals p
  LEFT JOIN public.proposal_votes v ON v.proposal_id = p.id
  LEFT JOIN public.proposal_comments c ON c.proposal_id = p.id
  WHERE p.id = proposal_uuid
  GROUP BY p.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user can modify proposal
CREATE OR REPLACE FUNCTION can_user_modify_proposal(proposal_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
  is_owner BOOLEAN;
  is_proposer BOOLEAN;
  proposal_status proposal_status;
BEGIN
  SELECT 
    t.created_by = user_uuid,
    p.proposed_by = user_uuid,
    p.status
  INTO is_owner, is_proposer, proposal_status
  FROM public.itinerary_proposals p
  JOIN public.trips t ON t.id = p.trip_id
  WHERE p.id = proposal_uuid;
  
  -- Owner can always modify
  IF is_owner THEN
    RETURN TRUE;
  END IF;
  
  -- Proposer can modify if still pending
  IF is_proposer AND proposal_status = 'pending' THEN
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;