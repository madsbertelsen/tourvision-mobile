


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pgsodium";






CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "public";






CREATE TYPE "public"."share_permission" AS ENUM (
    'view',
    'edit',
    'admin'
);


ALTER TYPE "public"."share_permission" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_document_collaborators"("p_document_id" "uuid") RETURNS TABLE("user_id" "uuid", "email" "text", "name" "text", "permission" "public"."share_permission", "is_owner" boolean, "shared_at" timestamp with time zone, "accepted_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  -- Get the owner
  SELECT
    d.created_by as user_id,
    u.email::text,
    p.full_name,
    'admin'::share_permission,
    true as is_owner,
    d.created_at as shared_at,
    d.created_at as accepted_at
  FROM documents d
  JOIN auth.users u ON u.id = d.created_by
  LEFT JOIN profiles p ON p.id = d.created_by
  WHERE d.id = p_document_id
  UNION ALL
  -- Get shared users
  SELECT
    ds.shared_with_user_id as user_id,
    u.email::text,
    p.full_name,
    ds.permission,
    false as is_owner,
    ds.created_at as shared_at,
    ds.accepted_at
  FROM document_shares ds
  JOIN auth.users u ON u.id = ds.shared_with_user_id
  LEFT JOIN profiles p ON p.id = ds.shared_with_user_id
  WHERE ds.document_id = p_document_id
  AND ds.accepted_at IS NOT NULL
  AND (ds.expires_at IS NULL OR ds.expires_at > NOW());
END;
$$;


ALTER FUNCTION "public"."get_document_collaborators"("p_document_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_document_share_links"("p_document_id" "uuid") RETURNS TABLE("id" "uuid", "share_code" "text", "permission" "public"."share_permission", "max_uses" integer, "current_uses" integer, "expires_at" timestamp with time zone, "is_active" boolean, "created_at" timestamp with time zone, "created_by" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- First check if the user owns the document
  IF NOT EXISTS (
    SELECT 1 FROM documents 
    WHERE documents.id = p_document_id 
    AND documents.created_by = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied: You must own this document to view share links';
  END IF;

  -- Return share links for the document
  RETURN QUERY
  SELECT 
    dsl.id,
    dsl.share_code,
    dsl.permission,
    dsl.max_uses,
    dsl.uses_count as current_uses,
    dsl.expires_at,
    dsl.is_active,
    dsl.created_at,
    dsl.created_by
  FROM document_share_links dsl
  WHERE dsl.document_id = p_document_id
  AND dsl.is_active = true
  ORDER BY dsl.created_at DESC;
END;
$$;


ALTER FUNCTION "public"."get_document_share_links"("p_document_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_trip_collaborators"("p_trip_id" "uuid") RETURNS TABLE("user_id" "uuid", "email" "text", "name" "text", "permission" "public"."share_permission", "is_owner" boolean, "shared_at" timestamp with time zone, "accepted_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  -- Get the owner
  SELECT
    t.created_by as user_id,
    u.email::text,  -- Cast varchar to text
    p.full_name,
    'admin'::share_permission,
    true as is_owner,
    t.created_at as shared_at,
    t.created_at as accepted_at
  FROM trips t
  JOIN auth.users u ON u.id = t.created_by
  LEFT JOIN profiles p ON p.id = t.created_by
  WHERE t.id = p_trip_id
  UNION ALL
  -- Get shared users
  SELECT
    ts.shared_with_user_id as user_id,
    u.email::text,  -- Cast varchar to text
    p.full_name,
    ts.permission,
    false as is_owner,
    ts.created_at as shared_at,
    ts.accepted_at
  FROM trip_shares ts
  JOIN auth.users u ON u.id = ts.shared_with_user_id
  LEFT JOIN profiles p ON p.id = ts.shared_with_user_id
  WHERE ts.trip_id = p_trip_id
  AND ts.accepted_at IS NOT NULL
  AND (ts.expires_at IS NULL OR ts.expires_at > NOW());
END;
$$;


ALTER FUNCTION "public"."get_trip_collaborators"("p_trip_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, avatar_url)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
        COALESCE(
            NEW.raw_user_meta_data->>'avatar_url',
            'https://api.dicebear.com/7.x/avataaars/svg?seed=' || NEW.id::text
        )
    );
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_chat_message_webhook"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    edge_function_url TEXT;
    service_role_key TEXT;
BEGIN
    -- Get the Edge Function URL and service role key
    edge_function_url := 'http://host.docker.internal:54321/functions/v1/process-chat-message';
    service_role_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

    -- Call the Edge Function using pg_net
    PERFORM net.http_post(
        url := edge_function_url,
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || service_role_key
        ),
        body := jsonb_build_object(
            'message_id', NEW.id,
            'trip_id', NEW.trip_id,
            'user_id', NEW.user_id,
            'message', NEW.message
        )
    );

    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."process_chat_message_webhook"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_proposal_vote_counts"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        -- Update approval and rejection counts
        UPDATE proposals
        SET
            approval_count = (
                SELECT COUNT(*) FROM proposal_votes
                WHERE proposal_id = NEW.proposal_id AND vote_type = 'approve'
            ),
            rejection_count = (
                SELECT COUNT(*) FROM proposal_votes
                WHERE proposal_id = NEW.proposal_id AND vote_type = 'reject'
            ),
            updated_at = NOW()
        WHERE id = NEW.proposal_id;

        -- Check if proposal should be auto-approved
        UPDATE proposals
        SET
            status = 'approved',
            approved_at = NOW()
        WHERE id = NEW.proposal_id
            AND status = 'pending'
            AND approval_count >= required_approvals;

    ELSIF TG_OP = 'DELETE' THEN
        -- Update counts after deletion
        UPDATE proposals
        SET
            approval_count = (
                SELECT COUNT(*) FROM proposal_votes
                WHERE proposal_id = OLD.proposal_id AND vote_type = 'approve'
            ),
            rejection_count = (
                SELECT COUNT(*) FROM proposal_votes
                WHERE proposal_id = OLD.proposal_id AND vote_type = 'reject'
            ),
            updated_at = NOW()
        WHERE id = OLD.proposal_id;
    END IF;

    RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."update_proposal_vote_counts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc', NOW());
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."use_share_link"("p_share_code" "text") RETURNS TABLE("success" boolean, "error" "text", "document_id" "uuid", "document_title" "text", "permission" "public"."share_permission")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_link RECORD;
  v_document RECORD;
  v_existing_share UUID;
BEGIN
  -- Find the share link
  SELECT * INTO v_link
  FROM document_share_links
  WHERE share_code = p_share_code
  AND (expires_at IS NULL OR expires_at > NOW())
  AND (max_uses IS NULL OR uses_count < max_uses);

  IF v_link.id IS NULL THEN
    RETURN QUERY SELECT false, 'Invalid or expired share link'::TEXT, NULL::UUID, NULL::TEXT, NULL::share_permission;
    RETURN;
  END IF;

  -- Get document details
  SELECT * INTO v_document
  FROM documents
  WHERE id = v_link.document_id;

  IF v_document.id IS NULL THEN
    RETURN QUERY SELECT false, 'Document not found'::TEXT, NULL::UUID, NULL::TEXT, NULL::share_permission;
    RETURN;
  END IF;

  -- Check if user already has access
  SELECT id INTO v_existing_share
  FROM document_shares
  WHERE document_id = v_link.document_id
  AND shared_with_user_id = auth.uid();

  IF v_existing_share IS NULL THEN
    -- Create new share
    INSERT INTO document_shares (document_id, shared_with_user_id, shared_by_user_id, permission, accepted_at)
    VALUES (v_link.document_id, auth.uid(), v_link.created_by, v_link.permission, NOW());
  ELSE
    -- Update existing share
    UPDATE document_shares
    SET accepted_at = NOW(), permission = v_link.permission
    WHERE id = v_existing_share;
  END IF;

  -- Record the use
  INSERT INTO document_share_link_uses (share_link_id, used_by_user_id)
  VALUES (v_link.id, auth.uid());

  -- Increment use count
  UPDATE document_share_links
  SET uses_count = uses_count + 1
  WHERE id = v_link.id;

  -- Return success
  RETURN QUERY SELECT
    true,
    NULL::TEXT,
    v_document.id,
    v_document.title,
    v_link.permission;
END;
$$;


ALTER FUNCTION "public"."use_share_link"("p_share_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_has_document_access"("p_document_id" "uuid", "p_user_id" "uuid", "p_min_permission" "public"."share_permission" DEFAULT 'view'::"public"."share_permission") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Check if user owns the document
  IF EXISTS (
    SELECT 1 FROM documents
    WHERE id = p_document_id AND created_by = p_user_id
  ) THEN
    RETURN TRUE;
  END IF;

  -- Check if user has been shared the document with sufficient permission
  IF p_min_permission = 'view' THEN
    RETURN EXISTS (
      SELECT 1 FROM document_shares
      WHERE document_id = p_document_id
      AND shared_with_user_id = p_user_id
      AND accepted_at IS NOT NULL
      AND (expires_at IS NULL OR expires_at > NOW())
    );
  ELSIF p_min_permission = 'edit' THEN
    RETURN EXISTS (
      SELECT 1 FROM document_shares
      WHERE document_id = p_document_id
      AND shared_with_user_id = p_user_id
      AND permission IN ('edit', 'admin')
      AND accepted_at IS NOT NULL
      AND (expires_at IS NULL OR expires_at > NOW())
    );
  ELSIF p_min_permission = 'admin' THEN
    RETURN EXISTS (
      SELECT 1 FROM document_shares
      WHERE document_id = p_document_id
      AND shared_with_user_id = p_user_id
      AND permission = 'admin'
      AND accepted_at IS NOT NULL
      AND (expires_at IS NULL OR expires_at > NOW())
    );
  END IF;

  RETURN FALSE;
END;
$$;


ALTER FUNCTION "public"."user_has_document_access"("p_document_id" "uuid", "p_user_id" "uuid", "p_min_permission" "public"."share_permission") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_owns_document"("doc_id" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.documents
    WHERE id = doc_id
    AND created_by = auth.uid()
  );
$$;


ALTER FUNCTION "public"."user_owns_document"("doc_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."ai_agent_config" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid",
    "enabled" boolean DEFAULT true,
    "personality" "text" DEFAULT 'helpful'::"text",
    "auto_suggest" boolean DEFAULT true,
    "suggestion_threshold" numeric(3,2) DEFAULT 0.7,
    "response_style" "text" DEFAULT 'concise'::"text",
    "language" "text" DEFAULT 'en'::"text",
    "preferences" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    CONSTRAINT "ai_agent_config_personality_check" CHECK (("personality" = ANY (ARRAY['helpful'::"text", 'professional'::"text", 'casual'::"text", 'adventurous'::"text"]))),
    CONSTRAINT "ai_agent_config_response_style_check" CHECK (("response_style" = ANY (ARRAY['concise'::"text", 'detailed'::"text", 'balanced'::"text"])))
);


ALTER TABLE "public"."ai_agent_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_operations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid",
    "user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "original_document" "jsonb" NOT NULL,
    "user_prompt" "text" NOT NULL,
    "ai_model" "text",
    "ai_confidence" double precision,
    "ai_reasoning" "text",
    "processing_time_ms" integer,
    "transaction_steps" "jsonb" NOT NULL,
    "operation_type" "text" NOT NULL,
    "target_position" integer,
    "html_reference" "text",
    "modified_document" "jsonb" NOT NULL,
    "affected_range" "jsonb",
    "diff_decorations" "jsonb",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "applied_at" timestamp with time zone,
    "reverted_at" timestamp with time zone,
    "inverse_steps" "jsonb",
    "checkpoint_state" "jsonb",
    CONSTRAINT "ai_operations_ai_confidence_check" CHECK ((("ai_confidence" >= (0)::double precision) AND ("ai_confidence" <= (1)::double precision))),
    CONSTRAINT "ai_operations_operation_type_check" CHECK (("operation_type" = ANY (ARRAY['insert_after'::"text", 'insert_before'::"text", 'replace'::"text", 'delete'::"text", 'append'::"text"]))),
    CONSTRAINT "ai_operations_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'applied'::"text", 'rejected'::"text", 'reverted'::"text"])))
);


ALTER TABLE "public"."ai_operations" OWNER TO "postgres";


COMMENT ON TABLE "public"."ai_operations" IS 'Complete history of AI-generated document operations with full transaction data for rollback and auditing';



CREATE TABLE IF NOT EXISTS "public"."ai_suggestions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid",
    "created_by" "uuid",
    "suggestion_type" "text" NOT NULL,
    "content" "jsonb" NOT NULL,
    "reasoning" "text",
    "confidence_score" numeric(3,2),
    "votes_for" integer DEFAULT 0,
    "votes_against" integer DEFAULT 0,
    "voter_ids" "uuid"[] DEFAULT '{}'::"uuid"[],
    "status" "text" DEFAULT 'pending'::"text",
    "expires_at" timestamp with time zone DEFAULT ("now"() + '24:00:00'::interval),
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "transaction_steps" "jsonb",
    "operation_metadata" "jsonb",
    "affected_range" "jsonb",
    "ai_confidence" double precision,
    CONSTRAINT "ai_suggestions_ai_confidence_check" CHECK ((("ai_confidence" >= (0)::double precision) AND ("ai_confidence" <= (1)::double precision))),
    CONSTRAINT "ai_suggestions_confidence_score_check" CHECK ((("confidence_score" >= (0)::numeric) AND ("confidence_score" <= (1)::numeric))),
    CONSTRAINT "ai_suggestions_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'rejected'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."ai_suggestions" OWNER TO "postgres";


COMMENT ON COLUMN "public"."ai_suggestions"."transaction_steps" IS 'ProseMirror transaction steps for the AI suggestion';



COMMENT ON COLUMN "public"."ai_suggestions"."operation_metadata" IS 'Metadata about how the AI generated this suggestion';



COMMENT ON COLUMN "public"."ai_suggestions"."affected_range" IS 'The document range affected by this suggestion {from: pos, to: pos}';



COMMENT ON COLUMN "public"."ai_suggestions"."ai_confidence" IS 'AI confidence score for this suggestion (0-1)';



CREATE TABLE IF NOT EXISTS "public"."bookings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid",
    "place_id" "uuid",
    "user_id" "uuid",
    "booking_type" "text" NOT NULL,
    "provider" "text",
    "reference_number" "text",
    "status" "text" DEFAULT 'pending'::"text",
    "check_in_date" timestamp with time zone,
    "check_out_date" timestamp with time zone,
    "total_cost" numeric(10,2),
    "currency" "text" DEFAULT 'USD'::"text",
    "confirmation_url" "text",
    "cancellation_policy" "text",
    "notes" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    CONSTRAINT "bookings_booking_type_check" CHECK (("booking_type" = ANY (ARRAY['accommodation'::"text", 'transport'::"text", 'activity'::"text", 'restaurant'::"text", 'other'::"text"]))),
    CONSTRAINT "bookings_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text", 'cancelled'::"text", 'completed'::"text"])))
);


ALTER TABLE "public"."bookings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."collaboration_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid",
    "user_id" "uuid",
    "awareness_state" "jsonb",
    "cursor_position" "jsonb",
    "selection_state" "jsonb",
    "is_active" boolean DEFAULT true,
    "last_seen_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"())
);


ALTER TABLE "public"."collaboration_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."document_chat_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "document_id" "uuid",
    "user_id" "uuid",
    "message" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"())
);


ALTER TABLE "public"."document_chat_messages" OWNER TO "postgres";


COMMENT ON TABLE "public"."document_chat_messages" IS 'Chat messages attached to documents';



CREATE TABLE IF NOT EXISTS "public"."document_chats" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "document_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "content" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "document_chats_role_check" CHECK (("role" = ANY (ARRAY['user'::"text", 'assistant'::"text", 'system'::"text"])))
);


ALTER TABLE "public"."document_chats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."document_invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "document_id" "uuid",
    "email" "text" NOT NULL,
    "invited_by" "uuid",
    "role" "text" DEFAULT 'viewer'::"text",
    "status" "text" DEFAULT 'pending'::"text",
    "token" "uuid" DEFAULT "gen_random_uuid"(),
    "expires_at" timestamp with time zone DEFAULT ("now"() + '7 days'::interval),
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "accepted_at" timestamp with time zone,
    CONSTRAINT "trip_invitations_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'editor'::"text", 'viewer'::"text"]))),
    CONSTRAINT "trip_invitations_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'declined'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."document_invitations" OWNER TO "postgres";


COMMENT ON TABLE "public"."document_invitations" IS 'Pending invitations to documents';



CREATE TABLE IF NOT EXISTS "public"."document_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "document_id" "uuid",
    "user_id" "uuid",
    "role" "text" DEFAULT 'viewer'::"text",
    "joined_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    CONSTRAINT "trip_members_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'editor'::"text", 'viewer'::"text"])))
);


ALTER TABLE "public"."document_members" OWNER TO "postgres";


COMMENT ON TABLE "public"."document_members" IS 'Members with access to documents';



CREATE TABLE IF NOT EXISTS "public"."document_places" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "document_id" "uuid",
    "place_id" "uuid",
    "day_number" integer,
    "order_in_day" integer,
    "duration_minutes" integer,
    "notes" "text",
    "booking_status" "text" DEFAULT 'not_needed'::"text",
    "booking_reference" "text",
    "cost_estimate" "jsonb",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    CONSTRAINT "trip_places_booking_status_check" CHECK (("booking_status" = ANY (ARRAY['not_needed'::"text", 'pending'::"text", 'confirmed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."document_places" OWNER TO "postgres";


COMMENT ON TABLE "public"."document_places" IS 'Places/locations referenced in documents';



CREATE TABLE IF NOT EXISTS "public"."document_share_link_uses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "share_link_id" "uuid" NOT NULL,
    "used_by" "uuid" NOT NULL,
    "used_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."document_share_link_uses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."document_share_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "document_id" "uuid" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "share_code" "text" DEFAULT "substr"("md5"(("random"())::"text"), 0, 9) NOT NULL,
    "permission" "public"."share_permission" DEFAULT 'view'::"public"."share_permission" NOT NULL,
    "max_uses" integer,
    "current_uses" integer DEFAULT 0,
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."document_share_links" OWNER TO "postgres";


COMMENT ON TABLE "public"."document_share_links" IS 'Shareable links for documents';



CREATE TABLE IF NOT EXISTS "public"."document_shares" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "document_id" "uuid" NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "shared_with_user_id" "uuid",
    "shared_with_email" "text",
    "permission" "public"."share_permission" DEFAULT 'view'::"public"."share_permission" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "accepted_at" timestamp with time zone,
    "expires_at" timestamp with time zone
);


ALTER TABLE "public"."document_shares" OWNER TO "postgres";


COMMENT ON TABLE "public"."document_shares" IS 'Sharing permissions for documents';



CREATE TABLE IF NOT EXISTS "public"."documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "destination" "text",
    "start_date" "date",
    "end_date" "date",
    "created_by" "uuid",
    "is_public" boolean DEFAULT false,
    "status" "text" DEFAULT 'planning'::"text",
    "collaborators" "uuid"[] DEFAULT '{}'::"uuid"[],
    "cover_image" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "sharing_enabled" boolean DEFAULT true,
    "default_share_permission" "public"."share_permission" DEFAULT 'view'::"public"."share_permission",
    "yjs_state" "bytea",
    "yjs_clock" bigint DEFAULT 0,
    "ai_generation_requested" boolean DEFAULT false,
    "ai_generation_in_progress" boolean DEFAULT false,
    CONSTRAINT "trips_status_check" CHECK (("status" = ANY (ARRAY['planning'::"text", 'booked'::"text", 'ongoing'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."documents" OWNER TO "postgres";


COMMENT ON TABLE "public"."documents" IS 'Collaborative documents (formerly trips) - generic for any use case';



COMMENT ON COLUMN "public"."documents"."yjs_state" IS 'Y.js CRDT state as binary data (BYTEA)';



COMMENT ON COLUMN "public"."documents"."yjs_clock" IS 'Y.js logical clock for versioning';



COMMENT ON COLUMN "public"."documents"."ai_generation_requested" IS 'Flag set by frontend to request AI generation from local agent';



COMMENT ON COLUMN "public"."documents"."ai_generation_in_progress" IS 'Flag set by local agent while processing AI generation';



CREATE TABLE IF NOT EXISTS "public"."expenses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid",
    "user_id" "uuid",
    "category" "text" NOT NULL,
    "description" "text",
    "amount" numeric(10,2) NOT NULL,
    "currency" "text" DEFAULT 'USD'::"text",
    "date" "date" NOT NULL,
    "split_between" "uuid"[],
    "receipt_url" "text",
    "is_reimbursable" boolean DEFAULT false,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"())
);


ALTER TABLE "public"."expenses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."map_tiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid",
    "bounds" "jsonb" NOT NULL,
    "zoom_levels" "int4range" NOT NULL,
    "tile_data" "bytea" NOT NULL,
    "format" "text" DEFAULT 'pmtiles'::"text",
    "size_bytes" bigint,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    CONSTRAINT "map_tiles_format_check" CHECK (("format" = ANY (ARRAY['pmtiles'::"text", 'mbtiles'::"text"])))
);


ALTER TABLE "public"."map_tiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."places" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "latitude" double precision,
    "longitude" double precision,
    "address" "text",
    "city" "text",
    "country" "text",
    "category" "text",
    "google_place_id" "text",
    "mapbox_place_id" "text",
    "photos" "text"[],
    "ratings" "jsonb",
    "opening_hours" "jsonb",
    "price_level" integer,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    CONSTRAINT "places_price_level_check" CHECK ((("price_level" >= 0) AND ("price_level" <= 4)))
);


ALTER TABLE "public"."places" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "username" "text",
    "full_name" "text",
    "avatar_url" "text",
    "bio" "text",
    "preferences" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"())
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."proposal_votes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "proposal_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "vote_type" "text" NOT NULL,
    "comment" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "proposal_votes_vote_type_check" CHECK (("vote_type" = ANY (ARRAY['approve'::"text", 'reject'::"text"])))
);


ALTER TABLE "public"."proposal_votes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."proposals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "document_id" "uuid",
    "created_by" "uuid",
    "source_message_id" "uuid",
    "proposal_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "current_content" "jsonb",
    "proposed_content" "jsonb",
    "chat_context" "text"[],
    "ai_reasoning" "text",
    "status" "text" DEFAULT 'pending'::"text",
    "votes" "jsonb" DEFAULT '{}'::"jsonb",
    "required_approvals" integer DEFAULT 1,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '24:00:00'::interval),
    "approved_at" timestamp with time zone,
    "approved_by" "uuid",
    "rejected_at" timestamp with time zone,
    "rejected_by" "uuid",
    "rejection_reason" "text",
    "enriched_data" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "proposal_operations" "jsonb",
    "diff_decorations" "jsonb",
    "transaction_steps" "jsonb",
    "operation_metadata" "jsonb",
    "ai_confidence" double precision,
    "approval_count" integer DEFAULT 0,
    "rejection_count" integer DEFAULT 0,
    "applied_at" timestamp with time zone,
    CONSTRAINT "proposals_ai_confidence_check" CHECK ((("ai_confidence" >= (0)::double precision) AND ("ai_confidence" <= (1)::double precision))),
    CONSTRAINT "proposals_proposal_type_check" CHECK (("proposal_type" = ANY (ARRAY['add'::"text", 'modify'::"text", 'remove'::"text", 'reorganize'::"text"]))),
    CONSTRAINT "proposals_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."proposals" OWNER TO "postgres";


COMMENT ON COLUMN "public"."proposals"."proposal_operations" IS 'ProseMirror operations/steps to transform current_content to proposed_content';



COMMENT ON COLUMN "public"."proposals"."diff_decorations" IS 'Decoration positions for visualizing diffs in the editor';



COMMENT ON COLUMN "public"."proposals"."transaction_steps" IS 'ProseMirror transaction steps for precise document transformation';



COMMENT ON COLUMN "public"."proposals"."operation_metadata" IS 'Additional metadata about the operation (user prompt, AI reasoning, etc)';



COMMENT ON COLUMN "public"."proposals"."ai_confidence" IS 'AI confidence score for the suggested change (0-1)';



CREATE TABLE IF NOT EXISTS "public"."yjs_updates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "update_data" "bytea" NOT NULL,
    "clock" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"())
);


ALTER TABLE "public"."yjs_updates" OWNER TO "postgres";


COMMENT ON TABLE "public"."yjs_updates" IS 'Incremental Y.js updates for efficient sync';



ALTER TABLE ONLY "public"."ai_agent_config"
    ADD CONSTRAINT "ai_agent_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_agent_config"
    ADD CONSTRAINT "ai_agent_config_trip_id_key" UNIQUE ("trip_id");



ALTER TABLE ONLY "public"."ai_operations"
    ADD CONSTRAINT "ai_operations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_suggestions"
    ADD CONSTRAINT "ai_suggestions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."collaboration_sessions"
    ADD CONSTRAINT "collaboration_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."collaboration_sessions"
    ADD CONSTRAINT "collaboration_sessions_trip_id_user_id_key" UNIQUE ("trip_id", "user_id");



ALTER TABLE ONLY "public"."document_chats"
    ADD CONSTRAINT "document_chats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."map_tiles"
    ADD CONSTRAINT "map_tiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."places"
    ADD CONSTRAINT "places_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."proposal_votes"
    ADD CONSTRAINT "proposal_votes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."proposal_votes"
    ADD CONSTRAINT "proposal_votes_proposal_id_user_id_key" UNIQUE ("proposal_id", "user_id");



ALTER TABLE ONLY "public"."proposals"
    ADD CONSTRAINT "proposals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."document_share_links"
    ADD CONSTRAINT "share_code_unique" UNIQUE ("share_code");



ALTER TABLE ONLY "public"."document_chat_messages"
    ADD CONSTRAINT "trip_chat_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."document_invitations"
    ADD CONSTRAINT "trip_invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."document_invitations"
    ADD CONSTRAINT "trip_invitations_trip_id_email_key" UNIQUE ("document_id", "email");



ALTER TABLE ONLY "public"."document_members"
    ADD CONSTRAINT "trip_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."document_members"
    ADD CONSTRAINT "trip_members_trip_id_user_id_key" UNIQUE ("document_id", "user_id");



ALTER TABLE ONLY "public"."document_places"
    ADD CONSTRAINT "trip_places_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."document_places"
    ADD CONSTRAINT "trip_places_trip_id_place_id_key" UNIQUE ("document_id", "place_id");



ALTER TABLE ONLY "public"."document_share_link_uses"
    ADD CONSTRAINT "trip_share_link_uses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."document_share_link_uses"
    ADD CONSTRAINT "trip_share_link_uses_share_link_id_used_by_key" UNIQUE ("share_link_id", "used_by");



ALTER TABLE ONLY "public"."document_share_links"
    ADD CONSTRAINT "trip_share_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."document_shares"
    ADD CONSTRAINT "trip_shares_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."document_shares"
    ADD CONSTRAINT "trip_shares_trip_id_shared_with_email_key" UNIQUE ("document_id", "shared_with_email");



ALTER TABLE ONLY "public"."document_shares"
    ADD CONSTRAINT "trip_shares_trip_id_shared_with_user_id_key" UNIQUE ("document_id", "shared_with_user_id");



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "trips_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."yjs_updates"
    ADD CONSTRAINT "yjs_updates_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_ai_operations_created_at" ON "public"."ai_operations" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_ai_operations_status" ON "public"."ai_operations" USING "btree" ("status");



CREATE INDEX "idx_ai_operations_trip_id" ON "public"."ai_operations" USING "btree" ("trip_id");



CREATE INDEX "idx_ai_operations_user_id" ON "public"."ai_operations" USING "btree" ("user_id");



CREATE INDEX "idx_ai_suggestions_status" ON "public"."ai_suggestions" USING "btree" ("status");



CREATE INDEX "idx_ai_suggestions_transaction_steps" ON "public"."ai_suggestions" USING "gin" ("transaction_steps");



CREATE INDEX "idx_ai_suggestions_trip_id" ON "public"."ai_suggestions" USING "btree" ("trip_id");



CREATE INDEX "idx_document_chats_created_at" ON "public"."document_chats" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_document_chats_document_id" ON "public"."document_chats" USING "btree" ("document_id");



CREATE INDEX "idx_document_chats_user_id" ON "public"."document_chats" USING "btree" ("user_id");



CREATE INDEX "idx_proposal_votes_created_at" ON "public"."proposal_votes" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_proposal_votes_proposal_id" ON "public"."proposal_votes" USING "btree" ("proposal_id");



CREATE INDEX "idx_proposal_votes_user_id" ON "public"."proposal_votes" USING "btree" ("user_id");



CREATE INDEX "idx_proposals_operations" ON "public"."proposals" USING "gin" ("proposal_operations");



CREATE INDEX "idx_proposals_status" ON "public"."proposals" USING "btree" ("status");



CREATE INDEX "idx_proposals_transaction_steps" ON "public"."proposals" USING "gin" ("transaction_steps");



CREATE INDEX "idx_proposals_trip_id" ON "public"."proposals" USING "btree" ("document_id");



CREATE INDEX "idx_trip_chat_messages_created_at" ON "public"."document_chat_messages" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_trip_chat_messages_trip_id" ON "public"."document_chat_messages" USING "btree" ("document_id");



CREATE INDEX "idx_trip_members_trip_id" ON "public"."document_members" USING "btree" ("document_id");



CREATE INDEX "idx_trip_members_user_id" ON "public"."document_members" USING "btree" ("user_id");



CREATE INDEX "idx_trip_places_trip_id" ON "public"."document_places" USING "btree" ("document_id");



CREATE INDEX "idx_trip_share_link_uses_share_link_id" ON "public"."document_share_link_uses" USING "btree" ("share_link_id");



CREATE INDEX "idx_trip_share_links_share_code" ON "public"."document_share_links" USING "btree" ("share_code");



CREATE INDEX "idx_trip_share_links_trip_id" ON "public"."document_share_links" USING "btree" ("document_id");



CREATE INDEX "idx_trip_shares_shared_with_email" ON "public"."document_shares" USING "btree" ("shared_with_email");



CREATE INDEX "idx_trip_shares_shared_with_user_id" ON "public"."document_shares" USING "btree" ("shared_with_user_id");



CREATE INDEX "idx_trip_shares_trip_id" ON "public"."document_shares" USING "btree" ("document_id");



CREATE INDEX "idx_trips_ai_generation_requested" ON "public"."documents" USING "btree" ("ai_generation_requested") WHERE ("ai_generation_requested" = true);



CREATE INDEX "idx_trips_created_by" ON "public"."documents" USING "btree" ("created_by");



CREATE INDEX "idx_trips_is_public" ON "public"."documents" USING "btree" ("is_public");



CREATE INDEX "idx_yjs_updates_trip_clock" ON "public"."yjs_updates" USING "btree" ("trip_id", "clock");



CREATE OR REPLACE TRIGGER "on_chat_message_created" AFTER INSERT ON "public"."document_chat_messages" FOR EACH ROW EXECUTE FUNCTION "public"."process_chat_message_webhook"();



CREATE OR REPLACE TRIGGER "update_ai_agent_config_updated_at" BEFORE UPDATE ON "public"."ai_agent_config" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "update_ai_suggestions_updated_at" BEFORE UPDATE ON "public"."ai_suggestions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "update_bookings_updated_at" BEFORE UPDATE ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "update_document_chats_updated_at" BEFORE UPDATE ON "public"."document_chats" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_expenses_updated_at" BEFORE UPDATE ON "public"."expenses" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "update_map_tiles_updated_at" BEFORE UPDATE ON "public"."map_tiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "update_places_updated_at" BEFORE UPDATE ON "public"."places" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "update_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "update_proposal_counts_on_vote" AFTER INSERT OR DELETE OR UPDATE ON "public"."proposal_votes" FOR EACH ROW EXECUTE FUNCTION "public"."update_proposal_vote_counts"();



CREATE OR REPLACE TRIGGER "update_proposals_updated_at" BEFORE UPDATE ON "public"."proposals" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "update_trip_chat_messages_updated_at" BEFORE UPDATE ON "public"."document_chat_messages" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "update_trip_places_updated_at" BEFORE UPDATE ON "public"."document_places" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "update_trips_updated_at" BEFORE UPDATE ON "public"."documents" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



ALTER TABLE ONLY "public"."ai_agent_config"
    ADD CONSTRAINT "ai_agent_config_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."documents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_operations"
    ADD CONSTRAINT "ai_operations_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."documents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_operations"
    ADD CONSTRAINT "ai_operations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_suggestions"
    ADD CONSTRAINT "ai_suggestions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_suggestions"
    ADD CONSTRAINT "ai_suggestions_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."documents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."documents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."collaboration_sessions"
    ADD CONSTRAINT "collaboration_sessions_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."documents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."collaboration_sessions"
    ADD CONSTRAINT "collaboration_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."document_chats"
    ADD CONSTRAINT "document_chats_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."document_chats"
    ADD CONSTRAINT "document_chats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."documents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."map_tiles"
    ADD CONSTRAINT "map_tiles_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."documents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."proposal_votes"
    ADD CONSTRAINT "proposal_votes_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."proposal_votes"
    ADD CONSTRAINT "proposal_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."proposals"
    ADD CONSTRAINT "proposals_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."proposals"
    ADD CONSTRAINT "proposals_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."proposals"
    ADD CONSTRAINT "proposals_rejected_by_fkey" FOREIGN KEY ("rejected_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."proposals"
    ADD CONSTRAINT "proposals_source_message_id_fkey" FOREIGN KEY ("source_message_id") REFERENCES "public"."document_chat_messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."proposals"
    ADD CONSTRAINT "proposals_trip_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."document_chat_messages"
    ADD CONSTRAINT "trip_chat_messages_trip_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."document_chat_messages"
    ADD CONSTRAINT "trip_chat_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."document_invitations"
    ADD CONSTRAINT "trip_invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."document_invitations"
    ADD CONSTRAINT "trip_invitations_trip_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."document_members"
    ADD CONSTRAINT "trip_members_trip_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."document_members"
    ADD CONSTRAINT "trip_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."document_places"
    ADD CONSTRAINT "trip_places_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."document_places"
    ADD CONSTRAINT "trip_places_trip_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."document_share_link_uses"
    ADD CONSTRAINT "trip_share_link_uses_share_link_id_fkey" FOREIGN KEY ("share_link_id") REFERENCES "public"."document_share_links"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."document_share_link_uses"
    ADD CONSTRAINT "trip_share_link_uses_used_by_fkey" FOREIGN KEY ("used_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."document_share_links"
    ADD CONSTRAINT "trip_share_links_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."document_share_links"
    ADD CONSTRAINT "trip_share_links_trip_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."document_shares"
    ADD CONSTRAINT "trip_shares_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."document_shares"
    ADD CONSTRAINT "trip_shares_shared_with_user_id_fkey" FOREIGN KEY ("shared_with_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."document_shares"
    ADD CONSTRAINT "trip_shares_trip_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "trips_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."yjs_updates"
    ADD CONSTRAINT "yjs_updates_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."documents"("id") ON DELETE CASCADE;



CREATE POLICY "AI can create suggestions" ON "public"."ai_suggestions" FOR INSERT WITH CHECK (true);



CREATE POLICY "Authenticated users can create places" ON "public"."places" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Document owners can manage members" ON "public"."document_members" USING ((EXISTS ( SELECT 1
   FROM "public"."documents"
  WHERE (("documents"."id" = "document_members"."document_id") AND ("documents"."created_by" = "auth"."uid"())))));



CREATE POLICY "Document owners can manage shares" ON "public"."document_shares" USING ((EXISTS ( SELECT 1
   FROM "public"."documents"
  WHERE (("documents"."id" = "document_shares"."document_id") AND ("documents"."created_by" = "auth"."uid"())))));



CREATE POLICY "Trip owners can create invitations" ON "public"."document_invitations" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."documents"
  WHERE (("documents"."id" = "document_invitations"."document_id") AND ("documents"."created_by" = "auth"."uid"())))));



CREATE POLICY "Trip owners can create share links" ON "public"."document_share_links" FOR INSERT WITH CHECK ((("created_by" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."documents"
  WHERE (("documents"."id" = "document_share_links"."document_id") AND ("documents"."created_by" = "auth"."uid"()))))));



CREATE POLICY "Trip owners can create shares" ON "public"."document_shares" FOR INSERT WITH CHECK ((("owner_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."documents"
  WHERE (("documents"."id" = "document_shares"."document_id") AND ("documents"."created_by" = "auth"."uid"()))))));



CREATE POLICY "Trip owners can delete their share links" ON "public"."document_share_links" FOR DELETE USING (("created_by" = "auth"."uid"()));



CREATE POLICY "Trip owners can delete their shares" ON "public"."document_shares" FOR DELETE USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "Trip owners can manage AI config" ON "public"."ai_agent_config" USING ((EXISTS ( SELECT 1
   FROM "public"."documents"
  WHERE (("documents"."id" = "ai_agent_config"."trip_id") AND ("documents"."created_by" = "auth"."uid"())))));



CREATE POLICY "Trip owners can update their share links" ON "public"."document_share_links" FOR UPDATE USING (("created_by" = "auth"."uid"()));



CREATE POLICY "Trip owners can update their shares" ON "public"."document_shares" FOR UPDATE USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "Users can create AI operations for editable trips" ON "public"."ai_operations" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."documents" "t"
  WHERE (("t"."id" = "ai_operations"."trip_id") AND ("t"."created_by" = "auth"."uid"())))));



CREATE POLICY "Users can create proposals for their trips" ON "public"."proposals" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."documents"
  WHERE (("documents"."id" = "proposals"."document_id") AND (("documents"."created_by" = "auth"."uid"()) OR ("auth"."uid"() = ANY ("documents"."collaborators")))))));



CREATE POLICY "Users can create share links for their documents" ON "public"."document_share_links" FOR INSERT WITH CHECK (("created_by" = "auth"."uid"()));



CREATE POLICY "Users can create votes on proposals they can access" ON "public"."proposal_votes" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND (EXISTS ( SELECT 1
   FROM ("public"."proposals" "p"
     JOIN "public"."documents" "t" ON (("p"."document_id" = "t"."id")))
  WHERE (("p"."id" = "proposal_votes"."proposal_id") AND (("t"."created_by" = "auth"."uid"()) OR ("t"."is_public" = true)))))));



CREATE POLICY "Users can delete own documents" ON "public"."documents" FOR DELETE USING (("created_by" = "auth"."uid"()));



CREATE POLICY "Users can delete share links for their documents" ON "public"."document_share_links" FOR DELETE USING (("created_by" = "auth"."uid"()));



CREATE POLICY "Users can delete their own votes" ON "public"."proposal_votes" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert chat messages for documents they can access" ON "public"."document_chat_messages" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."documents"
  WHERE (("documents"."id" = "document_chat_messages"."document_id") AND (("documents"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."document_shares"
          WHERE (("document_shares"."document_id" = "documents"."id") AND ("document_shares"."shared_with_user_id" = "auth"."uid"()) AND ("document_shares"."accepted_at" IS NOT NULL) AND (("document_shares"."expires_at" IS NULL) OR ("document_shares"."expires_at" > "now"()))))))))));



CREATE POLICY "Users can insert chats for their documents" ON "public"."document_chats" FOR INSERT TO "authenticated" WITH CHECK (("public"."user_owns_document"("document_id") AND ("user_id" = "auth"."uid"())));



CREATE POLICY "Users can insert own documents" ON "public"."documents" FOR INSERT WITH CHECK (("created_by" = "auth"."uid"()));



CREATE POLICY "Users can insert their own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can insert yjs_updates for accessible trips" ON "public"."yjs_updates" FOR INSERT WITH CHECK (("trip_id" IN ( SELECT "documents"."id"
   FROM "public"."documents"
  WHERE (("documents"."created_by" = "auth"."uid"()) OR ("auth"."uid"() = ANY ("documents"."collaborators"))))));



CREATE POLICY "Users can manage map tiles for their trips" ON "public"."map_tiles" USING ((EXISTS ( SELECT 1
   FROM "public"."documents"
  WHERE (("documents"."id" = "map_tiles"."trip_id") AND (("documents"."created_by" = "auth"."uid"()) OR ("auth"."uid"() = ANY ("documents"."collaborators")))))));



CREATE POLICY "Users can manage places for documents they own or edit" ON "public"."document_places" USING ((EXISTS ( SELECT 1
   FROM "public"."documents"
  WHERE (("documents"."id" = "document_places"."document_id") AND (("documents"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."document_shares"
          WHERE (("document_shares"."document_id" = "documents"."id") AND ("document_shares"."shared_with_user_id" = "auth"."uid"()) AND ("document_shares"."permission" = 'edit'::"public"."share_permission") AND ("document_shares"."accepted_at" IS NOT NULL) AND (("document_shares"."expires_at" IS NULL) OR ("document_shares"."expires_at" > "now"()))))))))));



CREATE POLICY "Users can manage their own bookings" ON "public"."bookings" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can manage their own expenses" ON "public"."expenses" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can manage their own sessions" ON "public"."collaboration_sessions" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can manage trip places for their trips" ON "public"."document_places" USING ((EXISTS ( SELECT 1
   FROM "public"."documents"
  WHERE (("documents"."id" = "document_places"."document_id") AND (("documents"."created_by" = "auth"."uid"()) OR ("auth"."uid"() = ANY ("documents"."collaborators")))))));



CREATE POLICY "Users can read yjs_updates for accessible trips" ON "public"."yjs_updates" FOR SELECT USING (("trip_id" IN ( SELECT "documents"."id"
   FROM "public"."documents"
  WHERE (("documents"."created_by" = "auth"."uid"()) OR ("auth"."uid"() = ANY ("documents"."collaborators")) OR ("documents"."is_public" = true)))));



CREATE POLICY "Users can record their link use" ON "public"."document_share_link_uses" FOR INSERT WITH CHECK (("used_by" = "auth"."uid"()));



CREATE POLICY "Users can send messages to their trips" ON "public"."document_chat_messages" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."documents"
  WHERE (("documents"."id" = "document_chat_messages"."document_id") AND (("documents"."created_by" = "auth"."uid"()) OR ("auth"."uid"() = ANY ("documents"."collaborators")))))));



CREATE POLICY "Users can update invitations they received" ON "public"."document_invitations" FOR UPDATE USING (("email" = (( SELECT "users"."email"
   FROM "auth"."users"
  WHERE ("users"."id" = "auth"."uid"())))::"text"));



CREATE POLICY "Users can update own documents and shared documents with edit p" ON "public"."documents" FOR UPDATE USING ((("created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."document_shares"
  WHERE (("document_shares"."document_id" = "documents"."id") AND ("document_shares"."shared_with_user_id" = "auth"."uid"()) AND ("document_shares"."permission" = 'edit'::"public"."share_permission") AND ("document_shares"."accepted_at" IS NOT NULL) AND (("document_shares"."expires_at" IS NULL) OR ("document_shares"."expires_at" > "now"())))))));



CREATE POLICY "Users can update places they have access to" ON "public"."places" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ("public"."document_places" "tp"
     JOIN "public"."documents" "t" ON (("t"."id" = "tp"."document_id")))
  WHERE (("tp"."place_id" = "places"."id") AND (("t"."created_by" = "auth"."uid"()) OR ("auth"."uid"() = ANY ("t"."collaborators")))))));



CREATE POLICY "Users can update proposals for their trips" ON "public"."proposals" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."documents"
  WHERE (("documents"."id" = "proposals"."document_id") AND (("documents"."created_by" = "auth"."uid"()) OR ("auth"."uid"() = ANY ("documents"."collaborators")))))));



CREATE POLICY "Users can update share links for their documents" ON "public"."document_share_links" FOR UPDATE USING (("created_by" = "auth"."uid"()));



CREATE POLICY "Users can update suggestions for their trips" ON "public"."ai_suggestions" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."documents"
  WHERE (("documents"."id" = "ai_suggestions"."trip_id") AND (("documents"."created_by" = "auth"."uid"()) OR ("auth"."uid"() = ANY ("documents"."collaborators")))))));



CREATE POLICY "Users can update their own AI operations" ON "public"."ai_operations" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can update their own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can update their own votes" ON "public"."proposal_votes" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view AI config for their trips" ON "public"."ai_agent_config" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."documents"
  WHERE (("documents"."id" = "ai_agent_config"."trip_id") AND (("documents"."created_by" = "auth"."uid"()) OR ("auth"."uid"() = ANY ("documents"."collaborators")))))));



CREATE POLICY "Users can view AI operations for accessible trips" ON "public"."ai_operations" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."documents" "t"
  WHERE (("t"."id" = "ai_operations"."trip_id") AND (("t"."created_by" = "auth"."uid"()) OR ("t"."is_public" = true))))));



CREATE POLICY "Users can view AI suggestions for their trips" ON "public"."ai_suggestions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."documents"
  WHERE (("documents"."id" = "ai_suggestions"."trip_id") AND (("documents"."created_by" = "auth"."uid"()) OR ("auth"."uid"() = ANY ("documents"."collaborators")))))));



CREATE POLICY "Users can view all places" ON "public"."places" FOR SELECT USING (true);



CREATE POLICY "Users can view all profiles" ON "public"."profiles" FOR SELECT USING (true);



CREATE POLICY "Users can view bookings for their trips" ON "public"."bookings" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."documents"
  WHERE (("documents"."id" = "bookings"."trip_id") AND (("documents"."created_by" = "auth"."uid"()) OR ("auth"."uid"() = ANY ("documents"."collaborators"))))))));



CREATE POLICY "Users can view chat messages for documents they can access" ON "public"."document_chat_messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."documents"
  WHERE (("documents"."id" = "document_chat_messages"."document_id") AND (("documents"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."document_shares"
          WHERE (("document_shares"."document_id" = "documents"."id") AND ("document_shares"."shared_with_user_id" = "auth"."uid"()) AND ("document_shares"."accepted_at" IS NOT NULL) AND (("document_shares"."expires_at" IS NULL) OR ("document_shares"."expires_at" > "now"()))))))))));



CREATE POLICY "Users can view expenses for their trips" ON "public"."expenses" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR ("auth"."uid"() = ANY ("split_between")) OR (EXISTS ( SELECT 1
   FROM "public"."documents"
  WHERE (("documents"."id" = "expenses"."trip_id") AND (("documents"."created_by" = "auth"."uid"()) OR ("auth"."uid"() = ANY ("documents"."collaborators"))))))));



CREATE POLICY "Users can view invitations they sent or received" ON "public"."document_invitations" FOR SELECT USING ((("invited_by" = "auth"."uid"()) OR ("email" = (( SELECT "users"."email"
   FROM "auth"."users"
  WHERE ("users"."id" = "auth"."uid"())))::"text")));



CREATE POLICY "Users can view map tiles for their trips" ON "public"."map_tiles" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."documents"
  WHERE (("documents"."id" = "map_tiles"."trip_id") AND (("documents"."is_public" = true) OR ("documents"."created_by" = "auth"."uid"()) OR ("auth"."uid"() = ANY ("documents"."collaborators")))))));



CREATE POLICY "Users can view members of documents they are part of" ON "public"."document_members" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."documents"
  WHERE (("documents"."id" = "document_members"."document_id") AND ("documents"."created_by" = "auth"."uid"()))))));



CREATE POLICY "Users can view messages for their trips" ON "public"."document_chat_messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."documents"
  WHERE (("documents"."id" = "document_chat_messages"."document_id") AND (("documents"."created_by" = "auth"."uid"()) OR ("auth"."uid"() = ANY ("documents"."collaborators")))))));



CREATE POLICY "Users can view own and shared documents" ON "public"."documents" FOR SELECT USING ((("created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."document_shares"
  WHERE (("document_shares"."document_id" = "documents"."id") AND ("document_shares"."shared_with_user_id" = "auth"."uid"()) AND ("document_shares"."accepted_at" IS NOT NULL) AND (("document_shares"."expires_at" IS NULL) OR ("document_shares"."expires_at" > "now"())))))));



CREATE POLICY "Users can view places for documents they can access" ON "public"."document_places" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."documents"
  WHERE (("documents"."id" = "document_places"."document_id") AND (("documents"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."document_shares"
          WHERE (("document_shares"."document_id" = "documents"."id") AND ("document_shares"."shared_with_user_id" = "auth"."uid"()) AND ("document_shares"."accepted_at" IS NOT NULL) AND (("document_shares"."expires_at" IS NULL) OR ("document_shares"."expires_at" > "now"()))))))))));



CREATE POLICY "Users can view proposals for their trips" ON "public"."proposals" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."documents"
  WHERE (("documents"."id" = "proposals"."document_id") AND (("documents"."created_by" = "auth"."uid"()) OR ("auth"."uid"() = ANY ("documents"."collaborators")))))));



CREATE POLICY "Users can view sessions for their trips" ON "public"."collaboration_sessions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."documents"
  WHERE (("documents"."id" = "collaboration_sessions"."trip_id") AND (("documents"."created_by" = "auth"."uid"()) OR ("auth"."uid"() = ANY ("documents"."collaborators")))))));



CREATE POLICY "Users can view share links for their documents" ON "public"."document_share_links" FOR SELECT USING (("created_by" = "auth"."uid"()));



CREATE POLICY "Users can view shares for their documents" ON "public"."document_shares" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."documents"
  WHERE (("documents"."id" = "document_shares"."document_id") AND ("documents"."created_by" = "auth"."uid"())))) OR ("shared_with_user_id" = "auth"."uid"())));



CREATE POLICY "Users can view shares for their trips or shares with them" ON "public"."document_shares" FOR SELECT USING ((("owner_id" = "auth"."uid"()) OR ("shared_with_user_id" = "auth"."uid"()) OR ("shared_with_email" = "auth"."email"())));



CREATE POLICY "Users can view their document chats" ON "public"."document_chats" FOR SELECT TO "authenticated" USING ("public"."user_owns_document"("document_id"));



CREATE POLICY "Users can view their own link uses" ON "public"."document_share_link_uses" FOR SELECT USING (("used_by" = "auth"."uid"()));



CREATE POLICY "Users can view their own share links" ON "public"."document_share_links" FOR SELECT USING ((("created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."documents"
  WHERE (("documents"."id" = "document_share_links"."document_id") AND ("documents"."created_by" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."document_shares"
  WHERE (("document_shares"."document_id" = "document_share_links"."document_id") AND ("document_shares"."shared_with_user_id" = "auth"."uid"()))))));



CREATE POLICY "Users can view trip places for their trips" ON "public"."document_places" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."documents"
  WHERE (("documents"."id" = "document_places"."document_id") AND (("documents"."is_public" = true) OR ("documents"."created_by" = "auth"."uid"()) OR ("auth"."uid"() = ANY ("documents"."collaborators")))))));



CREATE POLICY "Users can view votes on proposals they can see" ON "public"."proposal_votes" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."proposals" "p"
     JOIN "public"."documents" "t" ON (("p"."document_id" = "t"."id")))
  WHERE (("p"."id" = "proposal_votes"."proposal_id") AND (("t"."created_by" = "auth"."uid"()) OR ("t"."is_public" = true))))));



ALTER TABLE "public"."ai_agent_config" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_operations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_suggestions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bookings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."collaboration_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."document_chat_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."document_chats" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."document_invitations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."document_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."document_places" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."document_share_link_uses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."document_share_links" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."document_shares" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."expenses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."map_tiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."places" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."proposal_votes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."proposals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "trip_members_delete_policy" ON "public"."document_members" FOR DELETE USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."documents"
  WHERE (("documents"."id" = "document_members"."document_id") AND ("documents"."created_by" = "auth"."uid"()))))));



CREATE POLICY "trip_members_insert_policy" ON "public"."document_members" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."documents"
  WHERE (("documents"."id" = "document_members"."document_id") AND ("documents"."created_by" = "auth"."uid"())))));



CREATE POLICY "trip_members_select_policy" ON "public"."document_members" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "trips_delete_policy" ON "public"."documents" FOR DELETE USING (("auth"."uid"() = "created_by"));



CREATE POLICY "trips_insert_policy" ON "public"."documents" FOR INSERT WITH CHECK (("auth"."uid"() = "created_by"));



CREATE POLICY "trips_select_policy" ON "public"."documents" FOR SELECT USING ((("is_public" = true) OR ("created_by" = "auth"."uid"()) OR ("auth"."uid"() = ANY ("collaborators"))));



CREATE POLICY "trips_update_policy" ON "public"."documents" FOR UPDATE USING ((("auth"."uid"() = "created_by") OR ("auth"."uid"() = ANY ("collaborators"))));



ALTER TABLE "public"."yjs_updates" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."document_chats";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






GRANT ALL ON FUNCTION "public"."halfvec_in"("cstring", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_in"("cstring", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_in"("cstring", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_in"("cstring", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_out"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_out"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_out"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_out"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_recv"("internal", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_recv"("internal", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_recv"("internal", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_recv"("internal", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_send"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_send"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_send"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_send"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_typmod_in"("cstring"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_typmod_in"("cstring"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_typmod_in"("cstring"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_typmod_in"("cstring"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_in"("cstring", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_in"("cstring", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_in"("cstring", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_in"("cstring", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_out"("public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_out"("public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_out"("public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_out"("public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_recv"("internal", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_recv"("internal", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_recv"("internal", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_recv"("internal", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_send"("public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_send"("public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_send"("public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_send"("public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_typmod_in"("cstring"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_typmod_in"("cstring"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_typmod_in"("cstring"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_typmod_in"("cstring"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_halfvec"(real[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(real[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(real[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(real[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(real[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(real[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(real[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(real[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_halfvec"(double precision[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(double precision[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(double precision[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(double precision[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(double precision[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(double precision[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(double precision[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(double precision[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_halfvec"(integer[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(integer[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(integer[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(integer[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(integer[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(integer[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(integer[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(integer[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_halfvec"(numeric[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(numeric[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(numeric[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(numeric[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(numeric[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(numeric[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(numeric[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(numeric[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_to_float4"("public"."halfvec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_to_float4"("public"."halfvec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_to_float4"("public"."halfvec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_to_float4"("public"."halfvec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec"("public"."halfvec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec"("public"."halfvec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec"("public"."halfvec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec"("public"."halfvec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_to_sparsevec"("public"."halfvec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_to_sparsevec"("public"."halfvec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_to_sparsevec"("public"."halfvec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_to_sparsevec"("public"."halfvec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_to_vector"("public"."halfvec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_to_vector"("public"."halfvec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_to_vector"("public"."halfvec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_to_vector"("public"."halfvec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_to_halfvec"("public"."sparsevec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_to_halfvec"("public"."sparsevec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_to_halfvec"("public"."sparsevec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_to_halfvec"("public"."sparsevec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec"("public"."sparsevec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec"("public"."sparsevec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec"("public"."sparsevec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec"("public"."sparsevec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_to_vector"("public"."sparsevec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_to_vector"("public"."sparsevec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_to_vector"("public"."sparsevec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_to_vector"("public"."sparsevec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_to_halfvec"("public"."vector", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_to_halfvec"("public"."vector", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_to_halfvec"("public"."vector", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_to_halfvec"("public"."vector", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_to_sparsevec"("public"."vector", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_to_sparsevec"("public"."vector", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_to_sparsevec"("public"."vector", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_to_sparsevec"("public"."vector", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "service_role";


































































































































































GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_document_collaborators"("p_document_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_document_collaborators"("p_document_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_document_collaborators"("p_document_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_document_share_links"("p_document_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_document_share_links"("p_document_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_document_share_links"("p_document_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_trip_collaborators"("p_trip_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_trip_collaborators"("p_trip_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_trip_collaborators"("p_trip_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_accum"(double precision[], "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_accum"(double precision[], "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_accum"(double precision[], "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_accum"(double precision[], "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_add"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_add"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_add"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_add"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_avg"(double precision[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_avg"(double precision[]) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_avg"(double precision[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_avg"(double precision[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_cmp"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_cmp"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_cmp"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_cmp"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_combine"(double precision[], double precision[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_combine"(double precision[], double precision[]) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_combine"(double precision[], double precision[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_combine"(double precision[], double precision[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_concat"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_concat"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_concat"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_concat"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_eq"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_eq"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_eq"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_eq"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_ge"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_ge"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_ge"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_ge"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_gt"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_gt"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_gt"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_gt"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_l2_squared_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_l2_squared_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_l2_squared_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_l2_squared_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_le"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_le"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_le"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_le"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_lt"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_lt"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_lt"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_lt"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_mul"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_mul"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_mul"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_mul"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_ne"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_ne"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_ne"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_ne"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_negative_inner_product"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_negative_inner_product"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_negative_inner_product"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_negative_inner_product"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_spherical_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_spherical_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_spherical_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_spherical_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_sub"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_sub"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_sub"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_sub"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."hamming_distance"(bit, bit) TO "postgres";
GRANT ALL ON FUNCTION "public"."hamming_distance"(bit, bit) TO "anon";
GRANT ALL ON FUNCTION "public"."hamming_distance"(bit, bit) TO "authenticated";
GRANT ALL ON FUNCTION "public"."hamming_distance"(bit, bit) TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."hnsw_bit_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."hnsw_bit_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."hnsw_bit_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hnsw_bit_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."hnsw_halfvec_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."hnsw_halfvec_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."hnsw_halfvec_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hnsw_halfvec_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."hnsw_sparsevec_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."hnsw_sparsevec_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."hnsw_sparsevec_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hnsw_sparsevec_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."inner_product"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."inner_product"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."ivfflat_bit_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."ivfflat_bit_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."ivfflat_bit_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ivfflat_bit_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."ivfflat_halfvec_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."ivfflat_halfvec_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."ivfflat_halfvec_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ivfflat_halfvec_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."jaccard_distance"(bit, bit) TO "postgres";
GRANT ALL ON FUNCTION "public"."jaccard_distance"(bit, bit) TO "anon";
GRANT ALL ON FUNCTION "public"."jaccard_distance"(bit, bit) TO "authenticated";
GRANT ALL ON FUNCTION "public"."jaccard_distance"(bit, bit) TO "service_role";



GRANT ALL ON FUNCTION "public"."l1_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l1_distance"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_distance"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_norm"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_norm"("public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."process_chat_message_webhook"() TO "anon";
GRANT ALL ON FUNCTION "public"."process_chat_message_webhook"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_chat_message_webhook"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_cmp"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_cmp"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_cmp"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_cmp"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_eq"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_eq"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_eq"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_eq"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_ge"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_ge"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_ge"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_ge"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_gt"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_gt"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_gt"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_gt"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_l2_squared_distance"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_l2_squared_distance"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_l2_squared_distance"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_l2_squared_distance"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_le"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_le"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_le"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_le"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_lt"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_lt"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_lt"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_lt"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_ne"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_ne"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_ne"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_ne"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_negative_inner_product"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_negative_inner_product"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_negative_inner_product"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_negative_inner_product"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."subvector"("public"."halfvec", integer, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."subvector"("public"."halfvec", integer, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."subvector"("public"."halfvec", integer, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."subvector"("public"."halfvec", integer, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."subvector"("public"."vector", integer, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."subvector"("public"."vector", integer, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."subvector"("public"."vector", integer, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."subvector"("public"."vector", integer, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_proposal_vote_counts"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_proposal_vote_counts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_proposal_vote_counts"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."use_share_link"("p_share_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."use_share_link"("p_share_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."use_share_link"("p_share_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."user_has_document_access"("p_document_id" "uuid", "p_user_id" "uuid", "p_min_permission" "public"."share_permission") TO "anon";
GRANT ALL ON FUNCTION "public"."user_has_document_access"("p_document_id" "uuid", "p_user_id" "uuid", "p_min_permission" "public"."share_permission") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_has_document_access"("p_document_id" "uuid", "p_user_id" "uuid", "p_min_permission" "public"."share_permission") TO "service_role";



GRANT ALL ON FUNCTION "public"."user_owns_document"("doc_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."user_owns_document"("doc_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_owns_document"("doc_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_concat"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_concat"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_concat"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_concat"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_dims"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "service_role";












GRANT ALL ON FUNCTION "public"."avg"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."avg"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."avg"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."avg"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."sum"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sum"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."sum"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sum"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "service_role";


















GRANT ALL ON TABLE "public"."ai_agent_config" TO "anon";
GRANT ALL ON TABLE "public"."ai_agent_config" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_agent_config" TO "service_role";



GRANT ALL ON TABLE "public"."ai_operations" TO "anon";
GRANT ALL ON TABLE "public"."ai_operations" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_operations" TO "service_role";



GRANT ALL ON TABLE "public"."ai_suggestions" TO "anon";
GRANT ALL ON TABLE "public"."ai_suggestions" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_suggestions" TO "service_role";



GRANT ALL ON TABLE "public"."bookings" TO "anon";
GRANT ALL ON TABLE "public"."bookings" TO "authenticated";
GRANT ALL ON TABLE "public"."bookings" TO "service_role";



GRANT ALL ON TABLE "public"."collaboration_sessions" TO "anon";
GRANT ALL ON TABLE "public"."collaboration_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."collaboration_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."document_chat_messages" TO "anon";
GRANT ALL ON TABLE "public"."document_chat_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."document_chat_messages" TO "service_role";



GRANT ALL ON TABLE "public"."document_chats" TO "anon";
GRANT ALL ON TABLE "public"."document_chats" TO "authenticated";
GRANT ALL ON TABLE "public"."document_chats" TO "service_role";



GRANT ALL ON TABLE "public"."document_invitations" TO "anon";
GRANT ALL ON TABLE "public"."document_invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."document_invitations" TO "service_role";



GRANT ALL ON TABLE "public"."document_members" TO "anon";
GRANT ALL ON TABLE "public"."document_members" TO "authenticated";
GRANT ALL ON TABLE "public"."document_members" TO "service_role";



GRANT ALL ON TABLE "public"."document_places" TO "anon";
GRANT ALL ON TABLE "public"."document_places" TO "authenticated";
GRANT ALL ON TABLE "public"."document_places" TO "service_role";



GRANT ALL ON TABLE "public"."document_share_link_uses" TO "anon";
GRANT ALL ON TABLE "public"."document_share_link_uses" TO "authenticated";
GRANT ALL ON TABLE "public"."document_share_link_uses" TO "service_role";



GRANT ALL ON TABLE "public"."document_share_links" TO "anon";
GRANT ALL ON TABLE "public"."document_share_links" TO "authenticated";
GRANT ALL ON TABLE "public"."document_share_links" TO "service_role";



GRANT ALL ON TABLE "public"."document_shares" TO "anon";
GRANT ALL ON TABLE "public"."document_shares" TO "authenticated";
GRANT ALL ON TABLE "public"."document_shares" TO "service_role";



GRANT ALL ON TABLE "public"."documents" TO "anon";
GRANT ALL ON TABLE "public"."documents" TO "authenticated";
GRANT ALL ON TABLE "public"."documents" TO "service_role";



GRANT ALL ON TABLE "public"."expenses" TO "anon";
GRANT ALL ON TABLE "public"."expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."expenses" TO "service_role";



GRANT ALL ON TABLE "public"."map_tiles" TO "anon";
GRANT ALL ON TABLE "public"."map_tiles" TO "authenticated";
GRANT ALL ON TABLE "public"."map_tiles" TO "service_role";



GRANT ALL ON TABLE "public"."places" TO "anon";
GRANT ALL ON TABLE "public"."places" TO "authenticated";
GRANT ALL ON TABLE "public"."places" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."proposal_votes" TO "anon";
GRANT ALL ON TABLE "public"."proposal_votes" TO "authenticated";
GRANT ALL ON TABLE "public"."proposal_votes" TO "service_role";



GRANT ALL ON TABLE "public"."proposals" TO "anon";
GRANT ALL ON TABLE "public"."proposals" TO "authenticated";
GRANT ALL ON TABLE "public"."proposals" TO "service_role";



GRANT ALL ON TABLE "public"."yjs_updates" TO "anon";
GRANT ALL ON TABLE "public"."yjs_updates" TO "authenticated";
GRANT ALL ON TABLE "public"."yjs_updates" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































drop extension if exists "pg_net";

create extension if not exists "pg_net" with schema "public";

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


