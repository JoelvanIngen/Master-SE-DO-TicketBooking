# Architecture

## Current Architecture

This document outlines the technical architecture of the ticket booking migration project.

### Compute

We use AWS Lambda (Node.js/TypeScript) for all backend compute. This provides a scale-to-zero model, meaning we pay nothing for idle time and scale automatically under load.

- **API Entry Points:**
  - `BookingInitiator`: Receives WebSocket requests, writes the initial state, and starts the workflow.
  - `PublicEndpoint`: Serves synchronous HTTP GET requests for clients to retrieve ticket status.
- **State Routing:**
  - `streamRouter`: Listens to DynamoDB Streams and routes state changes to the correct SQS queues.
- **Worker Services (Simulated):**
  - `reserveSeats`, `paymentService`, `ticketGen`: Execute the core business logic.
- **Internal Handlers:**
  - `seatReservationResponseHandler`, `paymentResponseHandler`, `ticketGenResponseHandler`: Consume worker results from SQS and update the database.
  - `notificationHandler`: Pushes async status updates back to the client via WebSocket.
  - `dlqHandler`: Processes exhausted messages from the Dead Letter Queue to safely mark transactions as failed.

### State Management & Choreography

We replaced the centralized Camunda workflow engine with an event-driven choreography pattern. Amazon DynamoDB (`BookingTable`) is the single source of truth. When a database row is updated, DynamoDB Streams triggers the `streamRouter` Lambda, which evaluates the new status and pushes commands to specific SQS queues to trigger the next step.

### Messaging & Resilience

Amazon SQS decouples the worker services. We handle service unavailability predictively using SQS Visibility Timeouts and Maximum Receive Counts. If a worker fails repeatedly, SQS routes the message to a centralized Dead Letter Queue (DLQ). The `dlqHandler` then updates the database to a failed state and notifies the user.

### Networking & Security

Amazon API Gateway is the public entry point. Internal security relies natively on AWS IAM. We use the AWS Cloud Development Kit (CDK) to generate strict, least-privilege IAM policies, ensuring components only access the specific resources they need.

## Architectural decisions

This section explains architectural decisions made, with reasoning to reinforce our current approach.

### AWS EKS

AWS Elastic Kubernetes Service has a higher maintenance overhead, as the EKS control panel and worker nodes must be managed, upgraded, and monitored manually.
Setting up logging, monitoring, auto-scaling, and other add-ons for a relatively simple booking app would be overkill.
Furthermore, AWS EKS is better suited for long-running services or complex microservice applications, but less suitable for short workflows that execute once and exit.
Lastly, EKS has an hourly control-plane fee and always-on worker nodes, even with low traffic.
This would be much more expensive to run than Lambda Functions, which only incur costs per actual usage.

### AWS Fargate

AWS Fargate is more suitable for this task than EKS, but still requires a worked node to be always active, which makes it expensive.
Since booking workflows are idle post of the time, continuously paying for vCPU and memory is a waste of budget.
Furthermore, Fargate would be overkill for small functions, such as the functions used in this project.
All the infrastructure would still need to be managed, increasing deployment effort.

### AWS App Runner

AWS App Runner is designed for always-on web apps and APIs, not event-driven functions.
It suffers from similar cost and deployment effort problems as Fargate and EKS.

### AWS EC2

AWS EC2 is very infrastructure-heavy, as individual instances need to be managed, adding extra deployment overhead.
It is expensive, as you need to provision for peak capacity and pay for idle time.
Implementing communication between services would increase deployment complexity even further.
EC2 would be more suitable if the application required specific OS configurations, persistent state, or very long-running, stable processes.

### Amazon MQ

Amazon MQ is functionally equivalent to AWS SQS, but more restricted in scalability, and more expensive for the use case of this project.
Amazon MQ would require managing broker instances, which increases deployment complexity.
Furthermore, you pay for uptime per hour, instead of per usage such as in SQS.
The upside of Amazon MQ is the compatibility with RabbitMQ, requiring no code changes.
However, considering the small codebase of this project, rewriting is not a time-consuming task.

### Camunda
We replaced the centralized Camunda workflow engine with an event-driven choreography pattern. Amazon DynamoDB (`BookingTable`) is the single source of truth.

When a database row is updated, DynamoDB Streams triggers the `streamRouter` Lambda, which evaluates the new status and pushes commands to specific SQS queues to trigger the next step.
