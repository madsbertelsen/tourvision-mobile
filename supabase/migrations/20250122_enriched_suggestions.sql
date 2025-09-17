-- Add enriched data fields to AI suggestions for better context
ALTER TABLE public.ai_suggestions
ADD COLUMN IF NOT EXISTS enriched_data JSONB,
ADD COLUMN IF NOT EXISTS external_resources JSONB,
ADD COLUMN IF NOT EXISTS practical_info JSONB;

-- Add comments to document the new fields
COMMENT ON COLUMN public.ai_suggestions.enriched_data IS 'Rich contextual information about the suggestion including facts, highlights, and educational content';
COMMENT ON COLUMN public.ai_suggestions.external_resources IS 'External links and resources for more information (Wikipedia, official sites, reviews)';
COMMENT ON COLUMN public.ai_suggestions.practical_info IS 'Practical travel information like opening hours, costs, duration, accessibility';

-- Example structure for enriched_data:
-- {
--   "quick_facts": ["UNESCO World Heritage Site", "Built in 1420s"],
--   "highlights": ["Crown jewels exhibition", "Underground casemates"],
--   "why_visit": "Historic significance and cultural importance...",
--   "best_for": ["History enthusiasts", "Shakespeare fans", "Families"],
--   "media": {
--     "main_image": "url_to_image",
--     "gallery": ["url1", "url2"]
--   }
-- }

-- Example structure for practical_info:
-- {
--   "duration": "2-3 hours",
--   "best_time": "Morning to avoid crowds",
--   "admission": {
--     "adults": "145 DKK",
--     "children": "Free",
--     "students": "125 DKK"
--   },
--   "opening_hours": {
--     "summer": "10:00-17:30",
--     "winter": "11:00-16:00",
--     "closed": ["December 24-25", "December 31", "January 1"]
--   },
--   "location": {
--     "address": "Kronborg 2C, 3000 Helsingør, Denmark",
--     "coordinates": {"lat": 56.0389, "lng": 12.6213},
--     "distance_from_copenhagen": "45 km",
--     "transport_options": ["Train: 30 min from Copenhagen", "Car: 45 min via E47"]
--   },
--   "accessibility": {
--     "wheelchair": "Partially accessible",
--     "parking": "Available on site",
--     "facilities": ["Restaurant", "Gift shop", "Restrooms"]
--   }
-- }

-- Example structure for external_resources:
-- {
--   "official_website": "https://www.kronborg.dk",
--   "wikipedia": "https://en.wikipedia.org/wiki/Kronborg",
--   "tripadvisor": "https://www.tripadvisor.com/...",
--   "google_maps": "https://maps.google.com/...",
--   "booking_link": "https://billetto.dk/..."
-- }