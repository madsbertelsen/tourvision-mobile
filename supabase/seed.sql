-- Minimal seed data for TourVision Mobile App
-- Test user password: TestPassword123!

-- Create test user
INSERT INTO "auth"."users" (
    "instance_id", "id", "aud", "role", "email", "encrypted_password", "email_confirmed_at",
    "invited_at", "confirmation_token", "confirmation_sent_at", "recovery_token",
    "recovery_sent_at", "email_change_token_new", "email_change", "email_change_sent_at",
    "last_sign_in_at", "raw_app_meta_data", "raw_user_meta_data", "is_super_admin",
    "created_at", "updated_at", "phone", "phone_confirmed_at", "phone_change",
    "phone_change_token", "phone_change_sent_at", "email_change_token_current",
    "email_change_confirm_status", "banned_until", "reauthentication_token",
    "reauthentication_sent_at", "is_sso_user", "deleted_at", "is_anonymous"
)
VALUES (
    '00000000-0000-0000-0000-000000000000',
    'cc9ae3cd-a7ee-4de4-9603-fa396c32e20e',
    'authenticated',
    'authenticated',
    'test@example.com',
    '$2a$10$V/jDmtOjSpNQQrFhwH1TE.KVmTTyKYgVXD5w13vxcZ2dn725gqNhi',
    '2024-04-20 08:38:00.860548+00',
    NULL,
    '',
    '2024-04-20 08:37:43.343769+00',
    '',
    NULL,
    '',
    '',
    NULL,
    '2024-04-20 08:38:00.93864+00',
    '{"provider": "email", "providers": ["email"]}',
    '{"sub": "cc9ae3cd-a7ee-4de4-9603-fa396c32e20e", "email": "test@example.com", "email_verified": false, "phone_verified": false}',
    NULL,
    '2024-04-20 08:37:43.3385+00',
    '2024-04-20 08:38:00.942809+00',
    NULL,
    NULL,
    '',
    '',
    NULL,
    '',
    0,
    NULL,
    '',
    NULL,
    false,
    NULL,
    false
)
ON CONFLICT DO NOTHING;

-- Create identity for test user
INSERT INTO "auth"."identities" (
    "provider_id", "user_id", "identity_data", "provider", "last_sign_in_at", "created_at",
    "updated_at", "id"
)
VALUES (
    'cc9ae3cd-a7ee-4de4-9603-fa396c32e20e',
    'cc9ae3cd-a7ee-4de4-9603-fa396c32e20e',
    '{"sub": "cc9ae3cd-a7ee-4de4-9603-fa396c32e20e", "email": "test@example.com", "email_verified": false, "phone_verified": false}',
    'email',
    '2024-04-20 08:20:34.46275+00',
    '2024-04-20 08:20:34.462773+00',
    '2024-04-20 08:20:34.462773+00',
    'dc596ba8-f42f-4f0d-b688-4a1d081fafb7'
)
ON CONFLICT DO NOTHING;

-- Create profile for test user
INSERT INTO public.profiles (id, full_name, avatar_url, username)
VALUES (
    'cc9ae3cd-a7ee-4de4-9603-fa396c32e20e',
    'Test User',
    'https://api.dicebear.com/7.x/shapes/svg?seed=test&backgroundColor=3B82F6',
    'testuser'
)
ON CONFLICT (id) DO UPDATE
SET full_name = EXCLUDED.full_name,
    avatar_url = EXCLUDED.avatar_url,
    username = EXCLUDED.username;

-- Create one sample trip for testing
-- Note: yjs_state will be null initially, will be populated when user first edits
INSERT INTO public.trips (id, title, description, created_by, is_public)
VALUES (
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    'Barcelona Adventure',
    'A 5-day trip exploring the best of Barcelona',
    'cc9ae3cd-a7ee-4de4-9603-fa396c32e20e',
    true
)
ON CONFLICT (id) DO NOTHING;

-- Add test user as owner of the trip
INSERT INTO public.trip_members (trip_id, user_id, role)
VALUES (
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    'cc9ae3cd-a7ee-4de4-9603-fa396c32e20e',
    'owner'
)
ON CONFLICT (trip_id, user_id) DO NOTHING;

-- Output information
DO $$
BEGIN
    RAISE NOTICE '
=================================
SEED DATA CREATED SUCCESSFULLY
=================================
Test User:
----------
Email: test@example.com
Password: TestPassword123!

Sample Trip:
------------
- Barcelona Adventure

You can now login with these credentials!
=================================
    ';
END $$;