module.exports = {
  runWebSocketWorkflow,
};

/**
 * Books a single ticket
 */
async function runWebSocketWorkflow(context, ee) {
  const WS = globalThis.WebSocket;
  if (!WS) {
    ee.emit('counter', 'errors.no_ws_available', 1);
    throw new Error('WS not available');
  }

  const startTime = Date.now();
  let wssUrl = process.env.WSS_URL;
  if (!wssUrl) {
    ee.emit('counter', 'errors.no_wss_url_set', 1);
    throw new Error('WSS_URL environment variable is not set');
  }

  wssUrl = wssUrl.replace(/\/$/, '');

  try {
    await new Promise((resolve) => {
      const ws = new WS(wssUrl);

      let timeout = setTimeout(() => {
        ws.close();
        // Emit Artillery errors for the logs
        ee.emit('counter', 'booking_timeout', 1);
        ee.emit('counter', 'errors.timeout', 1);
        resolve();
      }, 60000);

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            action: 'bookTicket',
            simulateBookingFailure: 'none',
          }),
        );
      };

      ws.onmessage = (event) => {
        const payload = event.data.toString();
        let data;
        try {
          data = JSON.parse(payload);
        } catch {
          return; // Ignore noise
        }

        // Wait specifically for the workflow completion/failure message
        if (data.status) {
          clearTimeout(timeout);
          ws.close();

          const duration = Date.now() - startTime;

          ee.emit('histogram', 'workflow_duration_ms', duration);
          ee.emit('counter', `booking_${data.status.toLowerCase()}`, 1);

          if (!data.success) {
            ee.emit('counter', 'errors.booking_failed', 1);
          }

          resolve();
        }
      };

      ws.onerror = () => {
        ee.emit('counter', 'errors.ws_error', 1);
        clearTimeout(timeout);
        ws.close();
        resolve();
      };

      ws.onclose = (event) => {
        if (event.code !== 1000) {
          ee.emit('counter', `close_code.${event.code}`, 1);
        }
        resolve();
      };
    });
  } catch {
    ee.emit('counter', 'ws_error', 1);
    ee.emit('counter', 'errors.ws_error', 1);
  }
}
