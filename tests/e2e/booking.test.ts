import { test } from 'node:test';
import assert from 'node:assert';

const WS = globalThis.WebSocket;

interface BookingResponse {
  reservationId: string | null;
  paymentConfirmationId: string | null;
  ticketId: string | null;
  bookingReferenceId: string;
  status: string;
  success: boolean | null;
}

const WSS_URL = process.env.WSS_URL;
const API_URL = process.env.API_URL?.replace(/\/$/, '');
if (!WSS_URL || !API_URL) {
  throw new Error('No WSS_URL or API_URL environment variable set');
}

async function runWorkflow(simulateBookingFailure: string): Promise<BookingResponse> {
  return new Promise((resolve, reject) => {
    const ws = new WS(WSS_URL as string);
    let timeout: NodeJS.Timeout;

    ws.onopen = () => {
      // Send execution via WebSocket
      ws.send(JSON.stringify({ action: 'bookTicket', simulateBookingFailure }));
      timeout = setTimeout(() => {
        ws.close();
        reject(new Error('Timeout waiting for workflow'));
      }, 60000);
    };

    ws.onmessage = (event: any) => {
      const data = JSON.parse(event.data.toString()) as BookingResponse;
      // Filter out AWS connect noise
      if (data.status) {
        clearTimeout(timeout);
        ws.close();
        resolve(data);
      }
    };

    ws.onerror = (err: any) => {
      clearTimeout(timeout);
      reject(err);
    };
  });
}

test('Successful default run', async () => {
  const data = await runWorkflow('none');

  assert.strictEqual(data.status, 'COMPLETED');
  assert.strictEqual(data.success, true);
  assert.strictEqual(typeof data.reservationId, 'string');
  assert.strictEqual(typeof data.paymentConfirmationId, 'string');
  assert.strictEqual(typeof data.ticketId, 'string');
  assert.strictEqual(typeof data.bookingReferenceId, 'string');
});

test('Successful default run with HTTP fallback', async () => {
  const data = await runWorkflow('none');

  assert.strictEqual(data.status, 'COMPLETED');
  assert.strictEqual(data.success, true);
  assert.strictEqual(typeof data.reservationId, 'string');
  assert.strictEqual(typeof data.paymentConfirmationId, 'string');
  assert.strictEqual(typeof data.ticketId, 'string');
  assert.strictEqual(typeof data.bookingReferenceId, 'string');

  // Also lookup via HTTP to prove fallback works
  const getFallback = await fetch(`${API_URL}/ticket/${data.bookingReferenceId}`);
  assert.strictEqual(getFallback.status, 200);
  const fallbackData = (await getFallback.json()) as BookingResponse;
  assert.strictEqual(fallbackData.status, 'COMPLETED');
});

test('Seats failure handled correctly', async () => {
  const data = await runWorkflow('seats');

  assert.strictEqual(data.status, 'FAILED_SEATS_UNAVAILABLE');
  assert.strictEqual(data.success, false);
  assert.strictEqual(data.reservationId, undefined);
  assert.strictEqual(data.paymentConfirmationId, undefined);
  assert.strictEqual(data.ticketId, undefined);
  assert.strictEqual(typeof data.bookingReferenceId, 'string');
});

test('Ticket failure handled correctly', async () => {
  const data = await runWorkflow('ticket');

  assert.strictEqual(data.status, 'FAILED_TICKET_ERROR');
  assert.strictEqual(data.success, false);
  assert.strictEqual(typeof data.reservationId, 'string');
  assert.strictEqual(typeof data.paymentConfirmationId, 'string');
  assert.strictEqual(data.ticketId, undefined);
  assert.strictEqual(typeof data.bookingReferenceId, 'string');
});
