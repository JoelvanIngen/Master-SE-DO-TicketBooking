# Cloud-Native Ticket Booking System
This project is a cloud-native ticket booking system built on AWS using a serverless, event-driven architecture. The system uses a WebSocket API to start bookings and send live status updates, an HTTP API as a fallback lookup endpoint, DynamoDB to store booking state, SQS to decouple workflow steps, and Lambda functions to process each stage of the flow.

The goal of this project is to demonstrate a production-ready setup using AWS services.
It ensures the application is scalable, reliable, and cost-aware.


## Overview
This repository contains four main workspaces:
* `booking-service` – internal workflow logic and handlers for booking initiation, routing, result handling, notifications, and dead-letter recovery.
* `fake-services-nodejs` – mock downstream services for seat reservation, payment, and ticket generation.
* `public-endpoint-nodejs` – HTTP fallback endpoint for querying a booking by `bookingReferenceId`.
* `infra` – AWS CDK infrastructure for queues, APIs, Lambdas, DynamoDB, monitoring, alarms, and outputs.

The system is orchestrated through DynamoDB state changes and SQS messages rather than a centralized workflow engine. A booking starts through the WebSocket route `bookTicket`, gets written to DynamoDB with status `PENDING`, and is then routed through seat reservation, payment, and ticket generation based on status transitions. Terminal states are published back to the client through the notification queue.


## System Architecture
The system is deployed inside a Virtual Private Cloud (VPC) on AWS to ensure security.
![Architecture Diagram](./aws_architecture.png)


### Short Architecture Overview
At deployment time, the stack creates:
* a WebSocket API with routes `$connect`, `$disconnect`, and `bookTicket`
* an HTTP API with `GET /ticket/{bookingReferenceId}` for fallback lookup
* a DynamoDB `BookingTable` keyed by `bookingReferenceId`, with on-demand billing and DynamoDB Streams enabled
* SQS queues for seat reservation, payment, ticket generation, notifications, and a shared dead-letter queue
* Lambda functions for each workflow step, plus monitoring and alarms in CloudWatch


### Booking flow
1. A client sends a WebSocket message with action `bookTicket`.
2. `bookingInitiator` creates a DynamoDB item with `bookingReferenceId`, `connectionId`, `simulateBookingFailure`, and initial status `PENDING`.
3. `streamRouter` watches DynamoDB stream events and routes work based on status:
    * `PENDING` → seat reservation request queue
    * `SEATS_RESERVED` → payment request queue
    * `PAYMENT_COMPLETED` → ticket generation request queue
    * terminal states → notification queue
4. Response handlers update the DynamoDB item with the next status and any generated IDs.
5. `notificationHandler` sends the final result back to the WebSocket client.
6. If the WebSocket connection is unavailable, the booking can still be retrieved via the HTTP fallback endpoint.


## Repository structure
```
.
├── booking-service/           # Internal booking workflow logic
├── fake-services-nodejs/      # Mock seat/payment/ticket services
├── public-endpoint-nodejs/    # HTTP fallback lookup endpoint
├── infra/                     # AWS CDK infrastructure
├── tests/
│   ├── e2e/                   # End-to-end tests
│   └── load_tests/            # Artillery load tests
└── .github/workflows/         # CI/CD pipelines
```

This structure is reflected directly in the npm workspaces defined in the root `package.json`, and the CI pipeline builds/tests the three Node workspaces before synthesizing and deploying the infrastructure.


## Prerequisites
To work on this project locally, you should have:
* Node.js 24
* npm
* AWS credentials with permission to deploy CDK stacks
* an AWS account/region for deployment
* AWS CDK available through npx cdk ... or a global install

The repo and workflows are configured around Node 24, and deployment is done through CDK with AWS credentials configured for `eu-north-1`.


## Install dependencies
```
npm ci
```

The repo uses npm workspaces, so installing from the root resolves dependencies for all packages.


## Useful commands
```
npm run lint
npm run type-check
npm run format
npx cdk synth
```

These commands align with the root scripts and the checks used in CI. The reusable Node workflow also runs `npm audit`, Prettier, ESLint, TypeScript type-checking, and workspace tests


## Deploying the stack
The stack name follows the pattern `TicketBookingStack-${STACK_ENV}`. In CI, pull requests deploy preview stacks such as `PR-<number>`, while pushes to main deploy `TicketBookingStack-Prod`.

Example local deployment:

```
export STACK_ENV=Dev
npx cdk deploy "TicketBookingStack-$STACK_ENV" --require-approval never --outputs-file cdk-outputs.json
```

The CDK stack outputs both the HTTP API URL and the WebSocket URL after deployment.


## Running end-to-end tests
After deployment, export the API and WebSocket URLs and run:

```
export API_URL=<your-http-api-url>
export WSS_URL=<your-websocket-url>

npx tsx --test tests/e2e/booking.test.ts
```

The end-to-end suite covers:
* a successful default booking flow
* a successful booking plus HTTP fallback lookup
* a simulated seat reservation failure
* a simulated ticket generation failure


## Running load-tests
Load testing is defined with Artillery in 'tests/load_tests/load_test.yaml'. The suite includes `medium_load`, `full_load`, `double_load`, and `quadruple_load`, with thresholds for p99 workflow duration and max error rate.

```
export WSS_URL=<your-websocket-url>
npx artillery run -e medium_load tests/load_tests/load_test.yaml
```

The current load profiles ramp to 80, 160, 320, and 640 requests per second depending on the selected environment.


## API usage

### WebSocket
Connect to the deployed WebSocket URL and send a message like:

```
{
  "action": "bookTicket",
  "simulateBookingFailure": "none"
}
```

For testing failure scenarios, `simulateBookingFailure` can be set to `seats` or `ticket`. The system first emits/records a `PENDING` state and then transitions to a terminal status such as `COMPLETED`, `FAILED_SEATS_UNAVAILABLE`, or `FAILED_TICKET_ERROR`.



### HTTP fallback
Retrieve the stored booking record through:

```
GET /ticket/{bookingReferenceId}
```

The endpoint returns:
* `200` with the booking item when found
* `400` when `bookingReferenceId` is missing
* `404` when the booking or route does not exist
* `500` on unexpected server errors


## Monitoring and alarms
The stack creates a CloudWatch dashboard with widgets for:
* HTTP API traffic and latency
* Lambda invocations
* Lambda error counts
* overall Lambda error rate
* concurrent executions
* queue depth
* DynamoDB read/write usage

It also creates CloudWatch alarms for:
* average `BookingInitiator` latency above 3000 ms
* any Lambda error in the booking flow
* queue backlog above 5 messages for seat reservation, payment, ticket generation, and notification queues


## CI/CD
GitHub Actions runs the pipeline on pushes to `main`, pull requests targeting `main`, and manual dispatch. The pipeline:
1. builds and tests each Node workspace
2. synthesizes the infrastructure
3. deploys the CDK stack
4. extracts the HTTP and WebSocket URLs from CDK outputs
5. runs end-to-end tests
6. optionally runs manual load tests on workflow dispatch


## Notes
This project is designed as a prototype/demo of a cloud-native booking flow. The downstream services are intentionally mocked in `fake-services-nodejs`, while the infrastructure and orchestration patterns are set up to demonstrate decoupling, observability, and elasticity.