/**
 * YjsRoom - PartyKit-powered Durable Object for Y.js document collaboration
 *
 * This uses PartyKit's YServer which handles:
 * - Y.js sync protocol
 * - WebSocket management with reconnection/buffering
 * - State persistence to Durable Object storage
 * - Broadcasting updates to all connected clients
 * - Awareness protocol for cursor/presence
 *
 * Migration from custom implementation: 250 lines → 1 line!
 */

export { YServer as YjsRoom } from "y-partyserver";
