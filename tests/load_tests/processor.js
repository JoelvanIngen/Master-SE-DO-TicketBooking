module.exports = {
  pollBookingStatus: pollBookingStatus,
};

async function pollBookingStatus(context, ee) {
  const { bookingRef } = context.vars;
  const url = `${context.vars.$processEnvironment.API_URL}/ticket/${bookingRef}`;

  const MAX_RETRIES = 15;
  const RETRY_INTERVAL_MS = 2000;

  const startTime = Date.now();

  let attempts = 0;
  let finished = false;

  // Wait a bit before first attempt
  await new Promise((resolve) => setTimeout(resolve, RETRY_INTERVAL_MS));

  while (attempts < MAX_RETRIES && !finished) {
    try {
      const response = await fetch(url);

      if (response.status !== 200) {
        ee.emit('error', `GET returned ${response.status} for ${bookingRef}`);
        break;
      }

      const data = await response.json();

      // Check if workflow reached terminal state
      if (data.status !== 'PENDING' && data.status !== 'RUNNING') {
        finished = true;

        // Custom metrics for Artillery reports
        const metricName = `booking_${data.status.toLowerCase()}`;
        ee.emit('counter', metricName, 1);
        const duration = Date.now() - startTime;
        ee.emit('histogram', 'workflow_duration_ms', duration);
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
