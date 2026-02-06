/**
 * WebSocket Client — Live updates from Skynet registry
 * Reconnects automatically. Notifies listeners on panel changes.
 */

class SkynetWebSocket {
  constructor(url) {
    this.url = url || 'ws://localhost:3210/ws/panels';
    this.ws = null;
    this.listeners = [];
    this.reconnectDelay = 2000;
    this.maxReconnectDelay = 30000;
    this.currentDelay = this.reconnectDelay;
    this.shouldReconnect = true;
    this.connected = false;
  }

  /**
   * Connect to the WebSocket server
   */
  connect() {
    if (this.ws) {
      try { this.ws.close(); } catch (e) {}
    }

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('🔌 Skynet WS connected');
        this.connected = true;
        this.currentDelay = this.reconnectDelay;
        this.notify({ type: 'connection', status: 'connected' });
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.notify(msg);
        } catch (e) {
          console.warn('WS message parse error:', e);
        }
      };

      this.ws.onclose = () => {
        this.connected = false;
        this.notify({ type: 'connection', status: 'disconnected' });

        if (this.shouldReconnect) {
          setTimeout(() => this.connect(), this.currentDelay);
          this.currentDelay = Math.min(this.currentDelay * 1.5, this.maxReconnectDelay);
        }
      };

      this.ws.onerror = () => {
        this.connected = false;
      };
    } catch (err) {
      console.warn('WS connect error:', err.message);
      if (this.shouldReconnect) {
        setTimeout(() => this.connect(), this.currentDelay);
      }
    }
  }

  /**
   * Disconnect
   */
  disconnect() {
    this.shouldReconnect = false;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  /**
   * Subscribe to messages
   */
  onMessage(fn) {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter(l => l !== fn);
    };
  }

  /**
   * Notify all listeners
   */
  notify(msg) {
    this.listeners.forEach(fn => {
      try { fn(msg); } catch (e) { console.error('WS listener error:', e); }
    });
  }

  /**
   * Send a message
   */
  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }
}

if (typeof window !== 'undefined') {
  window.SkynetWebSocket = SkynetWebSocket;
}
