# Real-time Collaboration for TourVision

This document describes the real-time collaboration feature for TourVision trip documents using WebSocket technology and ProseMirror's collaboration capabilities.

## Architecture Overview

The collaboration system consists of three main components:

1. **WebSocket Server** (`/collab-server/`) - Node.js server using Socket.io for real-time communication
2. **ProseMirror Collaboration Plugin** (`/expo-app/assets/prosemirror-collab-plugin.js`) - Handles document synchronization
3. **React Native Integration** (`/expo-app/contexts/CollaborationContext.tsx`) - Manages collaboration state in the app

## How It Works

### Document Synchronization
- Uses ProseMirror's step-based approach for conflict-free collaborative editing
- Each edit is represented as a "step" that can be applied to the document
- Steps are versioned to handle concurrent edits from multiple users

### User Presence
- Shows connected users with colored badges
- Real-time cursor positions and selections
- User names are auto-generated (can be customized)

### Connection Management
- Automatic reconnection on network issues
- Visual status indicators (connected/connecting/disconnected)
- Graceful handling of server disconnections

## Setup Instructions

### 1. Install Dependencies

```bash
# Install collaboration server dependencies
cd collab-server
npm install

# Install expo app dependencies (if not already done)
cd ../expo-app
npm install
```

### 2. Start the Collaboration Server

```bash
cd collab-server
npm start
```

The server will run on port 3003 by default. You should see:
```
Collaboration server running on port 3003
WebSocket endpoint: ws://localhost:3003
Health check: http://localhost:3003/health
```

### 3. Configure the Expo App

Ensure your `.env.local` file contains:
```
EXPO_PUBLIC_COLLAB_SERVER_URL=http://localhost:3003
```

### 4. Start the Expo App

```bash
cd expo-app
npx expo start --web --port 8082
```

## Testing Collaboration

### Single Browser Testing (Split View)

1. Open http://localhost:8082 in your browser
2. Login with test credentials (test@example.com / TestPassword123!)
3. Open a trip document
4. Click "Start Collaboration" button
5. Open the same URL in an incognito window or different browser
6. Login and navigate to the same trip
7. Click "Start Collaboration"
8. Both windows should show "Connected (2 users)"
9. Try editing in one window - changes appear instantly in the other

### Multiple Device Testing

1. Start the Expo app for multiple platforms:
   ```bash
   npx expo start
   ```
2. Open on web (press 'w')
3. Open on iOS simulator (press 'i')
4. Open on Android emulator (press 'a')
5. Navigate to the same trip on each device
6. Start collaboration on all devices
7. Edit on one device to see real-time updates on others

### Features to Test

1. **Real-time Text Editing**
   - Type in one client, see updates in others
   - Multiple users can edit different parts simultaneously

2. **User Presence**
   - Colored user badges appear when multiple users connect
   - User count updates when users join/leave

3. **Cursor Tracking**
   - Each user's cursor position is visible with their color
   - Selection ranges are highlighted

4. **Conflict Resolution**
   - Two users edit the same text simultaneously
   - System should merge changes without data loss

5. **Connection Recovery**
   - Stop the collaboration server (`Ctrl+C`)
   - UI shows "Disconnected" status
   - Restart server - clients auto-reconnect

## Monitoring & Debugging

### Server Health Check
```bash
curl http://localhost:3003/health
```

Response:
```json
{
  "status": "ok",
  "documents": 2,
  "connections": 4
}
```

### Document State
```bash
curl http://localhost:3003/documents/{tripId}
```

### Server Logs
The collaboration server logs all significant events:
- Client connections/disconnections
- Document creation/cleanup
- Step processing
- Version conflicts and rebasing

### Client Debugging
In browser console:
- Look for `[Collab]` prefixed messages
- Check WebSocket connection in Network tab
- Monitor for any error messages

## Architecture Details

### Step-based Synchronization
1. User makes an edit → Creates a ProseMirror step
2. Step is sent to server with current version number
3. Server validates version and broadcasts to other clients
4. If version mismatch, client must rebase steps

### Version Management
- Each document has a version number
- Increments with each accepted step
- Clients must be at the same version to apply steps
- Automatic rebasing handles version conflicts

### Document Lifecycle
- Documents are created when first client joins
- Persist while clients are connected
- Auto-cleanup after 30 minutes of inactivity
- Checkpoints created every 100 steps

## Troubleshooting

### "Cannot start collaboration - missing dependencies"
- Ensure the ProseMirror bundle is rebuilt: `npm run build:prosemirror`
- Check that Socket.io CDN is accessible

### "Failed to connect to server"
- Verify collaboration server is running
- Check firewall/network settings
- Ensure correct URL in .env.local

### Changes not syncing
- Check browser console for WebSocket errors
- Verify both clients are on the same document ID
- Ensure both show "Connected" status

### Performance issues with many users
- The server can handle ~50 concurrent users per document
- Consider implementing operation throttling for very active documents
- Monitor server memory usage

## Future Enhancements

- [ ] Persistent document storage (currently in-memory only)
- [ ] User authentication and permissions
- [ ] Typing indicators
- [ ] Undo/redo coordination
- [ ] Offline editing with sync on reconnect
- [ ] Voice/video chat integration
- [ ] Change tracking and revision history
- [ ] User avatars and profiles
- [ ] Document locking for specific sections

## Security Considerations

**Current Implementation (Development Only)**
- No authentication on WebSocket connections
- All documents are publicly accessible
- No encryption of transmitted data

**Production Requirements**
- Add JWT authentication to WebSocket connections
- Implement document access permissions
- Use WSS (WebSocket Secure) with SSL/TLS
- Rate limiting to prevent abuse
- Input validation and sanitization
- Regular security audits

## API Reference

### WebSocket Events

#### Client → Server

**join-document**
```javascript
{
  documentId: string,
  clientName: string,
  initialDoc: object // ProseMirror document JSON
}
```

**send-steps**
```javascript
{
  version: number,
  steps: array, // ProseMirror steps
  clientID: string
}
```

**selection-changed**
```javascript
{
  from: number,
  to: number
}
```

#### Server → Client

**init**
```javascript
{
  version: number,
  doc: object, // Current document state
  steps: array, // Recent steps
  users: array // Connected users
}
```

**steps**
```javascript
{
  steps: array,
  clientID: string,
  version: number
}
```

**user-joined/user-left**
```javascript
{
  userId: string,
  userName: string,
  userColor: string
}
```

## License

This collaboration system is part of the TourVision project and follows the same license terms.