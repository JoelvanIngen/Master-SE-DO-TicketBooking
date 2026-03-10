module.exports = {
  startWorkflowTimer,
  shouldKeepPolling,
  recordWorkflowMetrics,
};

/**
 * Initializes workflow metrics before the HTTP requests begin.
 */
function startWorkflowTimer(context, ee, next) {
  context.vars.workflowStartTime = Date.now();
  // Initialize status to ensure loop condition evaluates correctly
  context.vars.bookingStatus = 'PENDING';
  return next();
}

/**
 * Evaluates whether the loop should continue polling.
 * Passed into the `whileTrue` block of the Artillery loop.
 */
function shouldKeepPolling(context, next) {
  const status = context.vars.bookingStatus;

  // Continue polling if the job has not reached terminal state
  const isStillProcessing = status === 'PENDING' || status === 'RUNNING';

  // Artillery whileTrue passes a boolean to `next()`
  return next(isStillProcessing);
}

/**
 * Runs after the loop completes to show final metrics.
 */
function recordWorkflowMetrics(context, ee, next) {
  const status = context.vars.bookingStatus;
  const startTime = context.vars.workflowStartTime;

  const isFinished = status !== 'PENDING' && status !== 'RUNNING';

  if (isFinished) {
    // Custom metrics for Artillery reports
    const metricName = `booking_${status.toLowerCase()}`;
    ee.emit('counter', metricName, 1);

    if (startTime) {
      const duration = Date.now() - startTime;
      ee.emit('histogram', 'workflow_duration_ms', duration);
    }
  } else {
    // Triggered if the loop reached the max count without finishing
    ee.emit('counter', 'booking_timeout', 1);
  }

  return next();
}
