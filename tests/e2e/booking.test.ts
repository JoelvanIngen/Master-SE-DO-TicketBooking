import { test } from 'node:test';
import assert from 'node:assert';

interface BookingResponse {
    reservationId: string | null;
    paymentConfirmationId: string | null;
    ticketId: string | null;
    bookingReferenceId: string;
    success: boolean;
}

// Remove training slash
const API_URL = process.env.API_URL?.replace(/\/$/, "");
if (!API_URL) {
    throw new Error("No API_URL environment variable set");
}

test('Successful default run', async () => {
    const response = await fetch(`${API_URL}/ticket`, { method: 'PUT' });
    const data = (await response.json()) as BookingResponse;

    assert.strictEqual(response.status, 200);
    assert.strictEqual(data.success, true);

    assert.strictEqual(typeof data.reservationId, 'string');
    assert.strictEqual(typeof data.paymentConfirmationId, 'string');
    assert.strictEqual(typeof data.ticketId, 'string');
    assert.strictEqual(typeof data.bookingReferenceId, 'string');
});

test('Seats failure handled correctly', async () => {
    const response = await fetch(`${API_URL}/ticket?simulateBookingFailure=seats`, { method: 'PUT' });
    const data = (await response.json()) as BookingResponse;

    assert.strictEqual(response.status, 200);
    assert.strictEqual(data.success, false);

    assert.strictEqual(data.reservationId, null);
    assert.strictEqual(data.paymentConfirmationId, null);
    assert.strictEqual(data.ticketId, null);
    assert.strictEqual(typeof data.bookingReferenceId, 'string');
});

test('Ticket failure handled correctly', async () => {
    const response = await fetch(`${API_URL}/ticket?simulateBookingFailure=ticket`, { method: 'PUT' });

    assert.strictEqual(response.status, 202);

    const body = await response.text();
    assert.strictEqual(body.length, 0, "Body should be empty");
});
