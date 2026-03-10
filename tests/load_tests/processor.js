module.exports = {
  pollBookingStatus: pollBookingStatus,
};

async function pollBookingStatus(context, ee) {
  const { bookingRef } = context.vars;
  const url = `${context.vars.$processEnvironment.API_URL}/ticket/${bookingRef}`;

  const MAX_RETRIES = 15;
  const RETRY_INTERVAL_MS = 2000;

  let attempts = 0;
  let finished = false;

  while (attempts < MAX_RETRIES && !finished) {
    try {
      const response = await fetch(url);
      const data = await response.json();

      if (response.status !== 200) {
        ee.emit('error', `GET returned ${response.status} for ${bookingRef}`);
        break;
      }

      // Check if workflow reached terminal state
      if (data.status !== 'PENDING' && data.status !== 'RUNNING') {
        finished = true;

        // Custom metrics for Artillery reports
        if (data.status === 'COMPLETED') {
          ee.emit('counter', 'booking_completed', 1);
        } else {
          ee.emit('counter', `booking_${data.status.toLowerCase()}`, 1);
        }
      } else {
        attempts++;
        // Wait before next poll
        await new Promise((resolve) => setTimeout(resolve, RETRY_INTERVAL_MS));
      }
    } catch (err) {
      ee.emit('error', `Polling error: ${err.message}`);
      break;
    }
  }

  if (!finished) {
    ee.emit('counter', 'booking_timeout', 1);
  }
}
