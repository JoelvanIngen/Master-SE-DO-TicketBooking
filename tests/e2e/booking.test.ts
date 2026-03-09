import { test } from 'node:test';
import assert from 'node:assert';

interface InitialBookingResponse {
  bookingReferenceId: string;
}

interface BookingResponse {
  reservationId: string | null;
  paymentConfirmationId: string | null;
  ticketId: string | null;
  bookingReferenceId: string;
  status: string;
  success: boolean | null;
}

const API_URL = process.env.API_URL?.replace(/\/$/, '');
if (!API_URL) {
  throw new Error('No API_URL environment variable set');
}

// Helper to retrieve booking reference ID
async function getBookingReferenceId(response: Response): Promise<string> {
  const putData = (await response.json()) as InitialBookingResponse;
  assert.ok(putData.bookingReferenceId, 'Has a returned bookingReferenceId');
  return putData.bookingReferenceId;
}

// Helper to poll the GET endpoint asynchronously
async function pollUntilComplete(bookingReferenceId: string): Promise<BookingResponse> {
  for (let i = 0; i < 30; i++) {
    const response = await fetch(`${API_URL}/ticket/${bookingReferenceId}`, { method: 'GET' });
    assert.strictEqual(response.status, 200, 'GET endpoint should return 200 OK');

    const data = (await response.json()) as BookingResponse;
    if (data.status !== 'PENDING') {
      return data;
    }
    // Wait 2 seconds
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error('Timeout waiting for workflow to complete');
}

test('Successful default run', async () => {
  const putResponse = await fetch(`${API_URL}/ticket`, { method: 'PUT' });
  assert.strictEqual(putResponse.status, 202);

  const bookingReferenceId = await getBookingReferenceId(putResponse);
  const data = await pollUntilComplete(bookingReferenceId);

  assert.strictEqual(data.status, 'COMPLETED');
  assert.strictEqual(data.success, true);
  assert.strictEqual(typeof data.reservationId, 'string');
  assert.strictEqual(typeof data.paymentConfirmationId, 'string');
  assert.strictEqual(typeof data.ticketId, 'string');
  assert.strictEqual(typeof data.bookingReferenceId, 'string');
});

test('Seats failure handled correctly', async () => {
  const putResponse = await fetch(`${API_URL}/ticket?simulateBookingFailure=seats`, {
    method: 'PUT',
  });
  assert.strictEqual(putResponse.status, 202);

  const bookingReferenceId = await getBookingReferenceId(putResponse);

  const data = await pollUntilComplete(bookingReferenceId);

  assert.strictEqual(data.status, 'FAILED_SEATS_UNAVAILABLE');
  assert.strictEqual(data.success, false);
  assert.strictEqual(data.reservationId, undefined);
  assert.strictEqual(data.paymentConfirmationId, undefined);
  assert.strictEqual(data.ticketId, undefined);
  assert.strictEqual(typeof data.bookingReferenceId, 'string');
});

test('Ticket failure handled correctly', async () => {
  const putResponse = await fetch(`${API_URL}/ticket?simulateBookingFailure=ticket`, {
    method: 'PUT',
  });
  assert.strictEqual(putResponse.status, 202);

  const bookingReferenceId = await getBookingReferenceId(putResponse);

  const data = await pollUntilComplete(bookingReferenceId);

  assert.strictEqual(data.status, 'FAILED_TICKET_ERROR');
  assert.strictEqual(data.success, false);
  assert.strictEqual(typeof data.reservationId, 'string');
  assert.strictEqual(typeof data.paymentConfirmationId, 'string');
  assert.strictEqual(data.ticketId, undefined);
  assert.strictEqual(typeof data.bookingReferenceId, 'string');
});
