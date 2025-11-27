/**
 * TURN Credentials Utility
 *
 * Fetches TURN server credentials from Cloudflare's TURN service
 */

export interface TurnCredentials {
  iceServers: Array<{
    urls: string[];
    username?: string;
    credential?: string;
  }>;
}

/**
 * Fetch TURN credentials from Cloudflare TURN service
 */
export async function fetchTurnCredentials(): Promise<TurnCredentials | null> {
  const TURN_KEY_ID = process.env.TURN_KEY_ID;
  const TURN_KEY_API_TOKEN = process.env.TURN_KEY_API_TOKEN;

  if (!TURN_KEY_ID || !TURN_KEY_API_TOKEN) {
    console.warn('[TURN] TURN credentials not configured. Set TURN_KEY_ID and TURN_KEY_API_TOKEN environment variables');
    return null;
  }

  try {
    const turnApiUrl = `https://rtc.live.cloudflare.com/v1/turn/keys/${TURN_KEY_ID}/credentials/generate-ice-servers`;

    const turnResponse = await fetch(turnApiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TURN_KEY_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ttl: 86400, // 24 hours
      }),
    });

    if (!turnResponse.ok) {
      const errorText = await turnResponse.text();
      console.error('[TURN] Failed to generate TURN credentials:', errorText);
      return null;
    }

    const turnData = await turnResponse.json() as TurnCredentials;

    // Filter out port 53 (blocked by browsers)
    if (turnData.iceServers && Array.isArray(turnData.iceServers)) {
      turnData.iceServers = turnData.iceServers.map((server) => {
        if (server.urls && Array.isArray(server.urls)) {
          server.urls = server.urls.filter((url: string) => !url.includes(':53'));
        }
        return server;
      }).filter((server) =>
        server.urls && (Array.isArray(server.urls) ? server.urls.length > 0 : true)
      );
    }

    console.log(`[TURN] ✅ Generated TURN credentials: ${turnData.iceServers.length} servers`);
    return turnData;
  } catch (error) {
    console.error('[TURN] Error fetching TURN credentials:', error);
    return null;
  }
}
