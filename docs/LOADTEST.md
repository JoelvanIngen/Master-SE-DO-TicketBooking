# Load Testing

This project uses Artillery to load test the ticket booking workflow over the deployed WebSocket API. The load test configuration lives in `tests/load_tests/load_test.yaml`, and the scenario logic is implemented in `tests/load_tests/processor.js`. The target WebSocket URL is provided through the `WSS_URL` environment variable.

## What is being tested

The load test exercises the full booking workflow through the public WebSocket entry point. For each virtual user, the processor opens a WebSocket connection, sends a `bookTicket` request with `simulateBookingFailure: 'none'`, waits for a final non-`PENDING` booking status, and then records the total workflow duration. The processor stops waiting after 60 seconds and records a timeout if no final status is received.

## Artillery configuration

The Artillery suite uses:
* `WSS_URL` as the test target
* `processor.js` as the scenario processor
* `statsInterval: 10`
* the `metrics-by-endpoint` plugin
* a single scenario named `Book ticket and await completion`


## Load levels

Four load levels are defined in `tests/load_tests/load_test.yaml`:
`medium_load`
* ramp from 1 request per second to 80 requests per second over 60 seconds
* sustain 80 requests per second for 120 seconds
`full_load`
* ramp from 1 request per second to 160 requests per second over 60 seconds
* sustain 160 requests per second for 120 seconds
`double_load`
* ramp from 1 request per second to 320 requests per second over 60 seconds
* sustain 320 requests per second for 120 seconds
`quadruple_load`
* ramp from 1 request per second to 640 requests per second over 60 seconds
* sustain 640 requests per second for 120 seconds


## Success criteria

The load test suite defines two built-in pass/fail conditions:
* `workflow_duration_ms.p99: 30000`
* `maxErrorRate: 5`

This means the suite is configured to fail if the 99th percentile workflow duration exceeds 30 seconds or if the error rate exceeds 5.

## Recorded metrics and counters

When a booking reaches a final status, the processor records a histogram metric named `workflow_duration_ms`. It also records a counter named `booking_<status>` using the returned booking status in lowercase. If the response indicates the booking was not successful, it records `errors.booking_failed`.

The processor also emits counters for several failure conditions, including:
* `errors.no_ws_available`
* `errors.no_wss_url_set`
* `booking_timeout`
* `errors.timeout`
* `errors.ws_error`
* `close_code.<code>`
* `ws_error`

## Running the load test locally

A load test can be run locally by setting `WSS_URL` and selecting one of the configured environments. The repo configuration and workflows use commands in this form:
```
export WSS_URL=<your-websocket-url>
npx artillery run -e medium_load tests/load_tests/load_test.yaml
```

To write the results to a JSON report file, the workflows use:
```
mkdir -p reports
npx artillery run \
  -e medium_load \
  --output "reports/medium_load.json" \
  tests/load_tests/load_test.yaml
```

## CI integration

The main pipeline includes a manual load-test stage that runs only through `workflow_dispatch` when `run_load_tests` is set to `true`. In that pipeline, load tests run only after a successful deploy and successful end-to-end tests, and it runs the `medium_load` and `full_load` levels. JSON reports are uploaded as workflow artifacts and retained for 7 days.

The repository also contains a separate `standalone-load-test.yml` workflow. That workflow accepts a user-provided `wss_url`, lets the operator choose between `medium_load`, `full_load`, `double_load`, and `quadruple_load`, and uploads the generated JSON report as an artifact with a retention period of 7 days.

## Scope of the current load test

The current load test targets the WebSocket-based booking flow only. It does not directly call the HTTP fallback endpoint during load execution. The processor always sends `simulateBookingFailure: 'none'`, so the configured load test is focused on the normal booking path rather than the failure scenarios used elsewhere in the repository.