import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { action, input, placeId, sessionToken } = await req.json()
    const apiKey = Deno.env.get('GOOGLE_PLACES_API_KEY')

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'Google Places API key not configured' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500
        }
      )
    }

    let url: string

    if (action === 'autocomplete') {
      // Places Autocomplete API
      url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?` +
        `input=${encodeURIComponent(input || '')}&` +
        `types=geocode|establishment&` +
        `key=${apiKey}` +
        (sessionToken ? `&sessiontoken=${sessionToken}` : '')
    } else if (action === 'details') {
      // Place Details API
      url = `https://maps.googleapis.com/maps/api/place/details/json?` +
        `place_id=${placeId}&` +
        `fields=geometry,name,formatted_address&` +
        `key=${apiKey}` +
        (sessionToken ? `&sessiontoken=${sessionToken}` : '')
    } else {
      return new Response(
        JSON.stringify({ error: 'Invalid action' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      )
    }

    const response = await fetch(url)
    const data = await response.json()

    return new Response(
      JSON.stringify(data),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})