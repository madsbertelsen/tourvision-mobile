<script setup lang="ts">
import { ref, onMounted } from 'vue'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

// Mapbox token - using the same token from your Expo app
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || 'pk.eyJ1IjoibWFkc2J1Y2giLCJhIjoiY200Y2RhYnYwMDd2YzJrcHp3YWduNXN3OSJ9.Qr_ydMXw8Wew6Oc2hXP8Tg'

// Chat state
const messages = ref<Array<{ role: 'user' | 'assistant', content: string }>>([])
const inputMessage = ref('')
const isLoading = ref(false)

// Map instance
let map: mapboxgl.Map | null = null

// Initialize map
onMounted(() => {
  mapboxgl.accessToken = MAPBOX_TOKEN

  map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/light-v11', // Light style
    center: [12.5700, 55.6867], // Copenhagen
    zoom: 12
  })

  // Add navigation controls
  map.addControl(new mapboxgl.NavigationControl(), 'top-right')
})

// Send message to Cloudflare worker
async function sendMessage() {
  if (!inputMessage.value.trim() || isLoading.value) return

  const userMessage = inputMessage.value.trim()
  inputMessage.value = ''

  // Add user message to chat
  messages.value.push({ role: 'user', content: userMessage })
  isLoading.value = true

  try {
    // Call your Cloudflare worker
    const response = await fetch('https://tour-vision-chat.madsbuch.workers.dev', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: messages.value
      })
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const reader = response.body?.getReader()
    const decoder = new TextDecoder()

    if (!reader) {
      throw new Error('No response body')
    }

    // Add assistant message placeholder
    messages.value.push({ role: 'assistant', content: '' })
    const assistantIndex = messages.value.length - 1

    // Stream the response
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value)
      const lines = chunk.split('\n')

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          if (data === '[DONE]') continue

          try {
            const parsed = JSON.parse(data)
            const content = parsed.choices[0]?.delta?.content
            if (content) {
              messages.value[assistantIndex].content += content
            }
          } catch (e) {
            console.error('Failed to parse SSE data:', e)
          }
        }
      }
    }
  } catch (error) {
    console.error('Error sending message:', error)
    messages.value.push({
      role: 'assistant',
      content: 'Sorry, there was an error processing your message.'
    })
  } finally {
    isLoading.value = false
  }
}

// Handle Enter key
function handleKeyDown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    sendMessage()
  }
}
</script>

<template>
  <div class="app-container">
    <!-- Fullscreen Map -->
    <div id="map" class="map-container"></div>

    <!-- Chat Interface -->
    <div class="chat-container">
      <!-- Messages -->
      <div class="messages">
        <div
          v-for="(message, index) in messages"
          :key="index"
          :class="['message', message.role === 'user' ? 'message-user' : 'message-assistant']"
        >
          <div class="message-content">{{ message.content }}</div>
        </div>
        <div v-if="isLoading && messages[messages.length - 1]?.role !== 'assistant'" class="message message-assistant">
          <div class="message-content">Thinking...</div>
        </div>
      </div>

      <!-- Input Box -->
      <div class="input-container">
        <input
          v-model="inputMessage"
          @keydown="handleKeyDown"
          type="text"
          placeholder="Ask about locations..."
          class="chat-input"
          :disabled="isLoading"
        />
        <button @click="sendMessage" class="send-button" :disabled="isLoading || !inputMessage.trim()">
          Send
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app-container {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

.map-container {
  width: 100%;
  height: 100%;
}

.chat-container {
  position: absolute;
  bottom: 20px;
  right: 20px;
  width: 400px;
  max-height: 500px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.06);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 400px;
}

.message {
  display: flex;
  flex-direction: column;
}

.message-user {
  align-items: flex-end;
}

.message-assistant {
  align-items: flex-start;
}

.message-content {
  max-width: 80%;
  padding: 12px 16px;
  border-radius: 8px;
  word-wrap: break-word;
}

.message-user .message-content {
  background: #3B82F6;
  color: white;
}

.message-assistant .message-content {
  background: #F3F4F6;
  color: #111827;
}

.input-container {
  display: flex;
  gap: 8px;
  padding: 16px;
  border-top: 1px solid #E5E7EB;
}

.chat-input {
  flex: 1;
  padding: 10px 12px;
  border: 1px solid #D1D5DB;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}

.chat-input:focus {
  border-color: #3B82F6;
}

.chat-input:disabled {
  background: #F3F4F6;
  cursor: not-allowed;
}

.send-button {
  padding: 10px 20px;
  background: #3B82F6;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.send-button:hover:not(:disabled) {
  background: #2563EB;
}

.send-button:disabled {
  background: #9CA3AF;
  cursor: not-allowed;
}

/* Scrollbar styling */
.messages::-webkit-scrollbar {
  width: 6px;
}

.messages::-webkit-scrollbar-track {
  background: #F3F4F6;
}

.messages::-webkit-scrollbar-thumb {
  background: #D1D5DB;
  border-radius: 3px;
}

.messages::-webkit-scrollbar-thumb:hover {
  background: #9CA3AF;
}
</style>
