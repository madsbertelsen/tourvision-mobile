-- Seed data for TourVision Mobile App
-- This file creates test users and sample data for development

-- IMPORTANT: Test user passwords are: TestPassword123!

-- Data for Name: users; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
INSERT INTO "auth"."users" (
"instance_id", "id", "aud", "role", "email", "encrypted_password", "email_confirmed_at",
                            "invited_at", "confirmation_token", "confirmation_sent_at", "recovery_token",
                            "recovery_sent_at", "email_change_token_new", "email_change", "email_change_sent_at",
                            "last_sign_in_at", "raw_app_meta_data", "raw_user_meta_data", "is_super_admin",
                            "created_at", "updated_at", "phone", "phone_confirmed_at", "phone_change",
                            "phone_change_token", "phone_change_sent_at", "email_change_token_current",
                            "email_change_confirm_status", "banned_until", "reauthentication_token",
                            "reauthentication_sent_at", "is_sso_user", "deleted_at", "is_anonymous")
VALUES ('00000000-0000-0000-0000-000000000000', 'cc9ae3cd-a7ee-4de4-9603-fa396c32e20e', 'authenticated',
        'authenticated', 'test@example.com', '$2a$10$V/jDmtOjSpNQQrFhwH1TE.KVmTTyKYgVXD5w13vxcZ2dn725gqNhi',
        '2024-04-20 08:38:00.860548+00', NULL, '', '2024-04-20 08:37:43.343769+00', '', NULL, '', '', NULL,
        '2024-04-20 08:38:00.93864+00', '{"provider": "email", "providers": ["email"]}',
        '{"sub": "cc9ae3cd-a7ee-4de4-9603-fa396c32e20e", "email": "test@example.com", "email_verified": false, "phone_verified": false}',
        NULL, '2024-04-20 08:37:43.3385+00', '2024-04-20 08:38:00.942809+00', NULL, NULL, '', '', NULL, '', 0, NULL, '',
        NULL, false, NULL, false);

-- Data for Name: identities; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
INSERT INTO "auth"."identities" (
"provider_id", "user_id", "identity_data", "provider", "last_sign_in_at", "created_at",
                                 "updated_at", "id")
VALUES ('cc9ae3cd-a7ee-4de4-9603-fa396c32e20e', 'cc9ae3cd-a7ee-4de4-9603-fa396c32e20e',
        '{"sub": "cc9ae3cd-a7ee-4de4-9603-fa396c32e20e", "email": "test@example.com", "email_verified": false, "phone_verified": false}',
        'email', '2024-04-20 08:20:34.46275+00', '2024-04-20 08:20:34.462773+00', '2024-04-20 08:20:34.462773+00',
        'dc596ba8-f42f-4f0d-b688-4a1d081fafb7');

-- Add test2 user
INSERT INTO "auth"."users" (
"instance_id", "id", "aud", "role", "email", "encrypted_password", "email_confirmed_at",
                            "invited_at", "confirmation_token", "confirmation_sent_at", "recovery_token",
                            "recovery_sent_at", "email_change_token_new", "email_change", "email_change_sent_at",
                            "last_sign_in_at", "raw_app_meta_data", "raw_user_meta_data", "is_super_admin",
                            "created_at", "updated_at", "phone", "phone_confirmed_at", "phone_change",
                            "phone_change_token", "phone_change_sent_at", "email_change_token_current",
                            "email_change_confirm_status", "banned_until", "reauthentication_token",
                            "reauthentication_sent_at", "is_sso_user", "deleted_at", "is_anonymous")
VALUES ('00000000-0000-0000-0000-000000000000', 'dd9ae3cd-a7ee-4de4-9603-fa396c32e20f', 'authenticated',
        'authenticated', 'test2@example.com', '$2a$10$V/jDmtOjSpNQQrFhwH1TE.KVmTTyKYgVXD5w13vxcZ2dn725gqNhi',
        '2024-04-20 08:38:00.860548+00', NULL, '', '2024-04-20 08:37:43.343769+00', '', NULL, '', '', NULL,
        '2024-04-20 08:38:00.93864+00', '{"provider": "email", "providers": ["email"]}',
        '{"sub": "dd9ae3cd-a7ee-4de4-9603-fa396c32e20f", "email": "test2@example.com", "email_verified": false, "phone_verified": false}',
        NULL, '2024-04-20 08:37:43.3385+00', '2024-04-20 08:38:00.942809+00', NULL, NULL, '', '', NULL, '', 0, NULL, '',
        NULL, false, NULL, false);

INSERT INTO "auth"."identities" (
"provider_id", "user_id", "identity_data", "provider", "last_sign_in_at", "created_at",
                                 "updated_at", "id")
VALUES ('dd9ae3cd-a7ee-4de4-9603-fa396c32e20f', 'dd9ae3cd-a7ee-4de4-9603-fa396c32e20f',
        '{"sub": "dd9ae3cd-a7ee-4de4-9603-fa396c32e20f", "email": "test2@example.com", "email_verified": false, "phone_verified": false}',
        'email', '2024-04-20 08:20:34.46275+00', '2024-04-20 08:20:34.462773+00', '2024-04-20 08:20:34.462773+00',
        'dc596ba8-f42f-4f0d-b688-4a1d081fafb8');

-- Add test3 user
INSERT INTO "auth"."users" (
"instance_id", "id", "aud", "role", "email", "encrypted_password", "email_confirmed_at",
                            "invited_at", "confirmation_token", "confirmation_sent_at", "recovery_token",
                            "recovery_sent_at", "email_change_token_new", "email_change", "email_change_sent_at",
                            "last_sign_in_at", "raw_app_meta_data", "raw_user_meta_data", "is_super_admin",
                            "created_at", "updated_at", "phone", "phone_confirmed_at", "phone_change",
                            "phone_change_token", "phone_change_sent_at", "email_change_token_current",
                            "email_change_confirm_status", "banned_until", "reauthentication_token",
                            "reauthentication_sent_at", "is_sso_user", "deleted_at", "is_anonymous")
VALUES ('00000000-0000-0000-0000-000000000000', 'ee9ae3cd-a7ee-4de4-9603-fa396c32e210', 'authenticated',
        'authenticated', 'test3@example.com', '$2a$10$V/jDmtOjSpNQQrFhwH1TE.KVmTTyKYgVXD5w13vxcZ2dn725gqNhi',
        '2024-04-20 08:38:00.860548+00', NULL, '', '2024-04-20 08:37:43.343769+00', '', NULL, '', '', NULL,
        '2024-04-20 08:38:00.93864+00', '{"provider": "email", "providers": ["email"]}',
        '{"sub": "ee9ae3cd-a7ee-4de4-9603-fa396c32e210", "email": "test3@example.com", "email_verified": false, "phone_verified": false}',
        NULL, '2024-04-20 08:37:43.3385+00', '2024-04-20 08:38:00.942809+00', NULL, NULL, '', '', NULL, '', 0, NULL, '',
        NULL, false, NULL, false);

INSERT INTO "auth"."identities" (
"provider_id", "user_id", "identity_data", "provider", "last_sign_in_at", "created_at",
                                 "updated_at", "id")
VALUES ('ee9ae3cd-a7ee-4de4-9603-fa396c32e210', 'ee9ae3cd-a7ee-4de4-9603-fa396c32e210',
        '{"sub": "ee9ae3cd-a7ee-4de4-9603-fa396c32e210", "email": "test3@example.com", "email_verified": false, "phone_verified": false}',
        'email', '2024-04-20 08:20:34.46275+00', '2024-04-20 08:20:34.462773+00', '2024-04-20 08:20:34.462773+00',
        'dc596ba8-f42f-4f0d-b688-4a1d081fafb9');

-- Create profiles for all test users with color-based names
INSERT INTO public.profiles (id, email, full_name, avatar_url, username)
VALUES
    ('cc9ae3cd-a7ee-4de4-9603-fa396c32e20e',
     'test@example.com',
     'Blue User',
     'https://api.dicebear.com/7.x/shapes/svg?seed=blue&backgroundColor=3B82F6',
     'blue'),
    ('dd9ae3cd-a7ee-4de4-9603-fa396c32e20f',
     'test2@example.com',
     'Green User',
     'https://api.dicebear.com/7.x/shapes/svg?seed=green&backgroundColor=10B981',
     'green'),
    ('ee9ae3cd-a7ee-4de4-9603-fa396c32e210',
     'test3@example.com',
     'Purple User',
     'https://api.dicebear.com/7.x/shapes/svg?seed=purple&backgroundColor=8B5CF6',
     'purple')
ON CONFLICT (id) DO UPDATE
SET full_name = EXCLUDED.full_name,
    avatar_url = EXCLUDED.avatar_url,
    username = EXCLUDED.username;

-- Create multiple sample trips for test user
-- 1. Barcelona Adventure (5 days) - Using flattened structure
INSERT INTO public.trips (id, title, description, itinerary_document, created_by, is_public)
VALUES (
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    'Barcelona Adventure',
    'A 5-day trip exploring the best of Barcelona',
    '{
        "type": "doc",
        "content": [
            {
                "type": "heading",
                "attrs": {"level": 1},
                "content": [{"type": "text", "text": "Barcelona Adventure"}]
            },
            {
                "type": "dayTransition",
                "attrs": {"date": "2024-09-15", "title": "Day 1: Arrival & Gothic Quarter"}
            },
            {
                "type": "destinationNode",
                "attrs": {
                    "destinationId": "bcn-airport",
                    "name": "Barcelona Airport (BCN)",
                    "coordinates": {"lat": 41.2974, "lng": 2.0833},
                    "duration": "1 hour",
                    "description": "Arrival at Barcelona El Prat Airport"
                }
            },
            {
                "type": "transportationNode",
                "attrs": {
                    "transportId": "transport-airport-hotel",
                    "mode": "taxi",
                    "fromDestination": "bcn-airport",
                    "toDestination": "hotel-check-in",
                    "duration": "25 min",
                    "distance": "12 km"
                }
            },
            {
                "type": "destinationNode",
                "attrs": {
                    "destinationId": "hotel-check-in",
                    "name": "Hotel Casa Fuster",
                    "coordinates": {"lat": 41.3952, "lng": 2.1574},
                    "duration": "30 min",
                    "description": "Check-in at 5-star hotel on Passeig de Gràcia"
                }
            },
            {
                "type": "transportationNode",
                "attrs": {
                    "transportId": "transport-hotel-gothic",
                    "mode": "walking",
                    "fromDestination": "hotel-check-in",
                    "toDestination": "gothic-quarter",
                    "duration": "15 min",
                    "distance": "1.2 km"
                }
            },
            {
                "type": "destinationNode",
                "attrs": {
                    "destinationId": "gothic-quarter",
                    "name": "Gothic Quarter",
                    "coordinates": {"lat": 41.3825, "lng": 2.1769},
                    "duration": "3 hours",
                    "description": "Explore the historic heart of Barcelona"
                }
            },
            {
                "type": "transportationNode",
                "attrs": {
                    "transportId": "transport-gothic-hotel",
                    "mode": "walking",
                    "fromDestination": "gothic-quarter",
                    "toDestination": "hotel-night-1",
                    "duration": "15 min",
                    "distance": "1.2 km"
                }
            },
            {
                "type": "destinationNode",
                "attrs": {
                    "destinationId": "hotel-night-1",
                    "name": "Hotel Casa Fuster",
                    "coordinates": {"lat": 41.3952, "lng": 2.1574},
                    "duration": "Overnight",
                    "description": "Rest at hotel"
                }
            },
            {
                "type": "dayTransition",
                "attrs": {"date": "2024-09-16", "title": "Day 2: Gaudi Tour"}
            },
            {
                "type": "destinationNode",
                "attrs": {
                    "destinationId": "hotel-morning-2",
                    "name": "Hotel Casa Fuster",
                    "coordinates": {"lat": 41.3952, "lng": 2.1574},
                    "duration": "30 min",
                    "description": "Breakfast at hotel"
                }
            },
            {
                "type": "transportationNode",
                "attrs": {
                    "transportId": "transport-hotel-sagrada",
                    "mode": "metro",
                    "fromDestination": "hotel-morning-2",
                    "toDestination": "sagrada-familia",
                    "duration": "12 min",
                    "distance": "2.5 km"
                }
            },
            {
                "type": "destinationNode",
                "attrs": {
                    "destinationId": "sagrada-familia",
                    "name": "Sagrada Familia",
                    "coordinates": {"lat": 41.4036, "lng": 2.1744},
                    "duration": "2 hours",
                    "description": "Visit Gaudi''s masterpiece"
                }
            },
            {
                "type": "transportationNode",
                "attrs": {
                    "transportId": "transport-1",
                    "mode": "metro",
                    "fromDestination": "sagrada-familia",
                    "toDestination": "park-guell",
                    "duration": "15 min",
                    "distance": "3.5 km"
                }
            },
            {
                "type": "destinationNode",
                "attrs": {
                    "destinationId": "park-guell",
                    "name": "Park Guell",
                    "coordinates": {"lat": 41.4145, "lng": 2.1527},
                    "duration": "2 hours",
                    "description": "Colorful mosaic park with city views"
                }
            },
            {
                "type": "transportationNode",
                "attrs": {
                    "transportId": "transport-park-hotel",
                    "mode": "taxi",
                    "fromDestination": "park-guell",
                    "toDestination": "hotel-night-2",
                    "duration": "10 min",
                    "distance": "3 km"
                }
            },
            {
                "type": "destinationNode",
                "attrs": {
                    "destinationId": "hotel-night-2",
                    "name": "Hotel Casa Fuster",
                    "coordinates": {"lat": 41.3952, "lng": 2.1574},
                    "duration": "Overnight",
                    "description": "Rest at hotel"
                }
            },
            {
                "type": "dayTransition",
                "attrs": {"date": "2024-09-17", "title": "Day 3: Departure"}
            },
            {
                "type": "destinationNode",
                "attrs": {
                    "destinationId": "hotel-checkout",
                    "name": "Hotel Casa Fuster",
                    "coordinates": {"lat": 41.3952, "lng": 2.1574},
                    "duration": "30 min",
                    "description": "Check-out from hotel"
                }
            },
            {
                "type": "transportationNode",
                "attrs": {
                    "transportId": "transport-to-airport",
                    "mode": "taxi",
                    "fromDestination": "hotel-checkout",
                    "toDestination": "bcn-airport-departure",
                    "duration": "25 min",
                    "distance": "12 km"
                }
            },
            {
                "type": "destinationNode",
                "attrs": {
                    "destinationId": "bcn-airport-departure",
                    "name": "Barcelona Airport (BCN)",
                    "coordinates": {"lat": 41.2974, "lng": 2.0833},
                    "duration": "2 hours",
                    "description": "Departure from Barcelona El Prat Airport"
                }
            }
        ]
    }'::jsonb,
    'cc9ae3cd-a7ee-4de4-9603-fa396c32e20e',
    true
)
ON CONFLICT (id) DO NOTHING;

-- 2. Tokyo Dreams (7 days)
INSERT INTO public.trips (id, title, description, itinerary_document, created_by, is_public)
VALUES (
    'b2c3d4e5-f6a7-8901-bcde-f01234567891',
    'Tokyo Dreams',
    'A week-long journey through modern and traditional Japan',
    '{
        "type": "doc",
        "content": [
            {
                "type": "heading",
                "attrs": {"level": 1},
                "content": [{"type": "text", "text": "Tokyo Dreams - 7 Day Adventure"}]
            },
            {
                "type": "dayNode",
                "attrs": {"date": "2024-12-01", "title": "Day 1: Arrival & Shibuya"},
                "content": [
                    {
                        "type": "destinationNode",
                        "attrs": {
                            "name": "Shibuya Crossing",
                            "coordinates": {"lat": 35.6595, "lng": 139.7004},
                            "duration": "2 hours",
                            "description": "Experience the world''s busiest pedestrian crossing"
                        }
                    },
                    {
                        "type": "destinationNode",
                        "attrs": {
                            "name": "Meiji Shrine",
                            "coordinates": {"lat": 35.6764, "lng": 139.6993},
                            "duration": "2 hours",
                            "description": "Peaceful Shinto shrine in the heart of Tokyo"
                        }
                    }
                ]
            },
            {
                "type": "dayNode",
                "attrs": {"date": "2024-12-02", "title": "Day 2: Traditional Tokyo"},
                "content": [
                    {
                        "type": "destinationNode",
                        "attrs": {
                            "name": "Senso-ji Temple",
                            "coordinates": {"lat": 35.7148, "lng": 139.7967},
                            "duration": "3 hours",
                            "description": "Tokyo''s oldest temple in Asakusa"
                        }
                    },
                    {
                        "type": "destinationNode",
                        "attrs": {
                            "name": "Tokyo Skytree",
                            "coordinates": {"lat": 35.7101, "lng": 139.8107},
                            "duration": "2 hours",
                            "description": "Panoramic views from Japan''s tallest structure"
                        }
                    }
                ]
            }
        ]
    }'::jsonb,
    'cc9ae3cd-a7ee-4de4-9603-fa396c32e20e',
    true
)
ON CONFLICT (id) DO NOTHING;

-- 3. Paris Romance (4 days)
INSERT INTO public.trips (id, title, description, itinerary_document, created_by, is_public)
VALUES (
    'c3d4e5f6-a7b8-9012-cdef-012345678902',
    'Paris Romance',
    'A romantic 4-day getaway in the City of Light',
    '{
        "type": "doc",
        "content": [
            {
                "type": "heading",
                "attrs": {"level": 1},
                "content": [{"type": "text", "text": "Paris Romance - 4 Days"}]
            },
            {
                "type": "dayNode",
                "attrs": {"date": "2024-10-15", "title": "Day 1: Classic Paris"},
                "content": [
                    {
                        "type": "destinationNode",
                        "attrs": {
                            "name": "Eiffel Tower",
                            "coordinates": {"lat": 48.8584, "lng": 2.2945},
                            "duration": "3 hours",
                            "description": "Iconic symbol of Paris with stunning views"
                        }
                    },
                    {
                        "type": "destinationNode",
                        "attrs": {
                            "name": "Louvre Museum",
                            "coordinates": {"lat": 48.8606, "lng": 2.3376},
                            "duration": "4 hours",
                            "description": "World''s largest art museum"
                        }
                    }
                ]
            },
            {
                "type": "dayNode",
                "attrs": {"date": "2024-10-16", "title": "Day 2: Montmartre & Seine"},
                "content": [
                    {
                        "type": "destinationNode",
                        "attrs": {
                            "name": "Sacre-Coeur",
                            "coordinates": {"lat": 48.8867, "lng": 2.3431},
                            "duration": "2 hours",
                            "description": "Beautiful basilica with panoramic city views"
                        }
                    },
                    {
                        "type": "destinationNode",
                        "attrs": {
                            "name": "Seine River Cruise",
                            "coordinates": {"lat": 48.8589, "lng": 2.2935},
                            "duration": "2 hours",
                            "description": "Romantic evening cruise along the Seine"
                        }
                    }
                ]
            }
        ]
    }'::jsonb,
    'cc9ae3cd-a7ee-4de4-9603-fa396c32e20e',
    false
)
ON CONFLICT (id) DO NOTHING;

-- 4. New York City Explorer (3 days)
INSERT INTO public.trips (id, title, description, itinerary_document, created_by, is_public)
VALUES (
    'd4e5f6a7-b8c9-0123-defa-123456789013',
    'NYC Weekend',
    'A whirlwind 3-day tour of the Big Apple',
    '{
        "type": "doc",
        "content": [
            {
                "type": "heading",
                "attrs": {"level": 1},
                "content": [{"type": "text", "text": "NYC Weekend Escape"}]
            },
            {
                "type": "dayNode",
                "attrs": {"date": "2024-11-08", "title": "Day 1: Manhattan Highlights"},
                "content": [
                    {
                        "type": "destinationNode",
                        "attrs": {
                            "name": "Central Park",
                            "coordinates": {"lat": 40.7829, "lng": -73.9654},
                            "duration": "3 hours",
                            "description": "Urban oasis in the heart of Manhattan"
                        }
                    },
                    {
                        "type": "destinationNode",
                        "attrs": {
                            "name": "Times Square",
                            "coordinates": {"lat": 40.7580, "lng": -73.9855},
                            "duration": "2 hours",
                            "description": "The crossroads of the world"
                        }
                    },
                    {
                        "type": "destinationNode",
                        "attrs": {
                            "name": "Empire State Building",
                            "coordinates": {"lat": 40.7484, "lng": -73.9857},
                            "duration": "2 hours",
                            "description": "Art Deco skyscraper with incredible views"
                        }
                    }
                ]
            }
        ]
    }'::jsonb,
    'cc9ae3cd-a7ee-4de4-9603-fa396c32e20e',
    true
)
ON CONFLICT (id) DO NOTHING;

-- 5. Bali Escape (10 days) - Currently Planning
INSERT INTO public.trips (id, title, description, itinerary_document, created_by, is_public)
VALUES (
    'e5f6a7b8-c9d0-1234-efab-234567890124',
    'Bali Escape',
    'A 10-day tropical paradise adventure (Planning in progress)',
    '{
        "type": "doc",
        "content": [
            {
                "type": "heading",
                "attrs": {"level": 1},
                "content": [{"type": "text", "text": "Bali Escape - 10 Days (Planning)"}]
            },
            {
                "type": "paragraph",
                "content": [{"type": "text", "text": "Trip dates: January 2025"}]
            },
            {
                "type": "dayNode",
                "attrs": {"date": "2025-01-15", "title": "Day 1: Arrival in Ubud"},
                "content": [
                    {
                        "type": "destinationNode",
                        "attrs": {
                            "name": "Ubud Monkey Forest",
                            "coordinates": {"lat": -8.5069, "lng": 115.2625},
                            "duration": "2 hours",
                            "description": "Sacred monkey forest sanctuary"
                        }
                    }
                ]
            }
        ]
    }'::jsonb,
    'cc9ae3cd-a7ee-4de4-9603-fa396c32e20e',
    false
)
ON CONFLICT (id) DO NOTHING;

-- Add trip members for Barcelona Adventure
INSERT INTO public.trip_members (trip_id, user_id, role, joined_at, onboarding_completed)
SELECT
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890', -- Barcelona Adventure
  id,
  'owner',
  NOW(),
  true
FROM auth.users
WHERE email = 'test@example.com'
ON CONFLICT (trip_id, user_id) DO NOTHING;

-- Add test2 as member
INSERT INTO public.trip_members (trip_id, user_id, role, joined_at, onboarding_completed)
SELECT
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890', -- Barcelona Adventure
  id,
  'member',
  NOW() - INTERVAL '2 days',
  true
FROM auth.users
WHERE email = 'test2@example.com'
ON CONFLICT (trip_id, user_id) DO NOTHING;

-- Add test3 as member
INSERT INTO public.trip_members (trip_id, user_id, role, joined_at, onboarding_completed)
SELECT
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890', -- Barcelona Adventure
  id,
  'member',
  NOW() - INTERVAL '1 day',
  false -- Still in onboarding
FROM auth.users
WHERE email = 'test3@example.com'
ON CONFLICT (trip_id, user_id) DO NOTHING;

-- Add sample places
INSERT INTO public.places (id, name, description, location, address, category, rating, google_place_id)
VALUES 
    ('f1b2c3d4-e5f6-7890-abcd-ef1234567890', 
     'Sagrada Familia', 
     'Antoni Gaudi''s unfinished masterpiece',
     '{"lat": 41.4036, "lng": 2.1744}'::jsonb,
     'C/ de Mallorca, 401, 08013 Barcelona, Spain',
     'attraction',
     4.7,
     'ChIJk_s92NyipBIRUMnDG8Kq2Js'),
    ('f2b2c3d4-e5f6-7890-abcd-ef1234567890',
     'Park Guell',
     'Whimsical park with colorful mosaics',
     '{"lat": 41.4145, "lng": 2.1527}'::jsonb,
     '08024 Barcelona, Spain',
     'park',
     4.5,
     'ChIJv_FYgkuipBIRTpjDo3tLLgY'),
    ('f3b2c3d4-e5f6-7890-abcd-ef1234567890',
     'Gothic Quarter',
     'Historic neighborhood with medieval streets',
     '{"lat": 41.3825, "lng": 2.1769}'::jsonb,
     'Barri Gotic, Barcelona, Spain',
     'neighborhood',
     4.6,
     'ChIJT-ydL02ipBIRYG8Y6KuFYYo'),
    ('f4b2c3d4-e5f6-7890-abcd-ef1234567890',
     'Barceloneta Beach',
     'Popular beach with restaurants and activities',
     '{"lat": 41.3781, "lng": 2.1896}'::jsonb,
     'Passeig Marítim de la Barceloneta, Barcelona, Spain',
     'beach',
     4.4,
     'ChIJx2YtVNOipBIRQPWj4LjIHj0')
ON CONFLICT (id) DO NOTHING;

-- Link places to the sample trip
INSERT INTO public.trip_places (trip_id, place_id, order_index, notes)
VALUES
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'f3b2c3d4-e5f6-7890-abcd-ef1234567890', 0, 'Start with Gothic Quarter exploration'),
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'f1b2c3d4-e5f6-7890-abcd-ef1234567890', 1, 'Book tickets in advance'),
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'f2b2c3d4-e5f6-7890-abcd-ef1234567890', 2, 'Best views at sunset')
ON CONFLICT DO NOTHING;

-- Add trip members for testing attendance features
INSERT INTO public.trip_members (trip_id, user_id, role, onboarding_completed)
VALUES
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'cc9ae3cd-a7ee-4de4-9603-fa396c32e20e', 'owner', true),
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'dd9ae3cd-a7ee-4de4-9603-fa396c32e20f', 'member', true),
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'ee9ae3cd-a7ee-4de4-9603-fa396c32e210', 'member', true)
ON CONFLICT (trip_id, user_id) DO NOTHING;

-- Add user attendance for destinations (sample data)
INSERT INTO public.user_attendance (trip_id, user_id, destination_id, day_index, status, notes, decided_at)
VALUES
    -- Blue User (test@example.com) - mostly confirmed
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'cc9ae3cd-a7ee-4de4-9603-fa396c32e20e', 'gothic-quarter', 0, 'confirmed', NULL, NOW()),
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'cc9ae3cd-a7ee-4de4-9603-fa396c32e20e', 'sagrada-familia', 0, 'confirmed', NULL, NOW()),

    -- Green User (test2@example.com) - proposing alternative for Gothic Quarter
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'dd9ae3cd-a7ee-4de4-9603-fa396c32e20f', 'gothic-quarter', 0, 'alternative', 'I prefer the beach!', NOW()),
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'dd9ae3cd-a7ee-4de4-9603-fa396c32e20f', 'barceloneta-beach', 0, 'confirmed', 'Let''s go to the beach instead!', NOW()),
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'dd9ae3cd-a7ee-4de4-9603-fa396c32e20f', 'sagrada-familia', 0, 'confirmed', NULL, NOW()),

    -- Purple User (test3@example.com) - mostly confirmed
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'ee9ae3cd-a7ee-4de4-9603-fa396c32e210', 'gothic-quarter', 0, 'confirmed', NULL, NOW()),
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'ee9ae3cd-a7ee-4de4-9603-fa396c32e210', 'sagrada-familia', 0, 'confirmed', NULL, NOW())
ON CONFLICT DO NOTHING;

-- Add parallel activity for Green user's beach alternative
INSERT INTO public.parallel_activities (id, trip_id, day_index, time_slot_start, time_slot_end, original_destination_id, alternative_destination_id, created_by, created_at)
VALUES
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567891',
     'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
     0,
     '14:00:00',
     '17:00:00',
     'gothic-quarter',
     'barceloneta-beach',
     'dd9ae3cd-a7ee-4de4-9603-fa396c32e20f', -- Green User
     NOW())
ON CONFLICT DO NOTHING;

-- Note: Sample activities not added due to trigger function issue
-- You can add activities after login through the app

-- Output useful information
DO $$
BEGIN
    RAISE NOTICE '
=================================
SEED DATA CREATED SUCCESSFULLY
=================================
Test Users:
-----------
Email: test@example.com
Password: TestPassword123!

Email: test2@example.com  
Password: TestPassword123!

Sample Data:
------------
- 5 Trips:
  * Barcelona Adventure (5 days) - Completed
  * Tokyo Dreams (7 days) - Upcoming
  * Paris Romance (4 days) - Private
  * NYC Weekend (3 days) - Public
  * Bali Escape (10 days) - Planning
- 4 Places: Sagrada Familia, Park Guell, Gothic Quarter, Barceloneta Beach
- Collaboration features ready

You can now login with these credentials!
=================================
    ';
END $$;