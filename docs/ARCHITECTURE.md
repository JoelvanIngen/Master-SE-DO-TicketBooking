# Architecture

## Current Architecture

This file explains the technical architecture of the project.

### Compute

AWS Lambda is used to run code, without need for manual server management.
This approach is inherently scalable, and very AWS-native.
Functions are written in Java and TypeScript:

- Java Functions
  - `GenerateTicketHandler`: Triggers ticket generation
  - `RetrievePaymentHandler`: Pushes messages to SQS to trigger payment requests
  - `PaymentResponseHandler`: Consumer that processes payment responses from SQS and continues the workflow
- TypeScript Functions
  - `reserveSeats`: Simulates seat reservation logic
  - `payment`: Simulates payment provider logic
  - `ticketGen`: Simulates ticket identifier generation logic

### Orchestration

AWS Step Functions are used to coordinate the workflow.
It manages the sequence of seat reservation, payment processing, and ticket generation.
The workflow is described in `CODEFLOW.md`

### Messaging

AWS SQS manages message passing between functions.
Two queues are used: a payment request queue (consumed by the `payment` service) and a payment response queue (consumed by `PaymentResponseHandler`).

### API

Amazon API Gateway (HTTP API) exposes a public REST endpoint for the application.
A `PUT /ticket` route is configured, which is integrated with the `publicEndpoint` Lambda function.

### Storage

Amazon DynamoDB is used as the database for persistent booking data.

### Security

AWS IAM is used to control access between all services.
Each Lambda function is granted only the permissions it needs through fine-grained IAM policies:

- `RetrievePaymentHandler` can send messages to the payment request queue.
- `payment` can send messages to the payment response queue.
- `GenerateTicketHandler` can invoke the `ticketGen` Lambda.
- `publicEndpoint` can start and read Step Function executions.
- `PaymentResponseHandler` can send task responses to Step Functions.
- The Step Functions state machine can invoke the `reserveSeats`, `RetrievePaymentHandler`, and `GenerateTicketHandler` Lambdas.

### Infrastructure as Code

AWS CDK (TypeScript) is used to define all infrastructure in a single stack (`TicketBookingStack`).
This includes all Lambda functions, SQS queues, the Step Function state machine, the API Gateway, the DynamoDB table, and all IAM permissions.
The stack is deployed to the `eu-north-1` region.

## Architectural decisions

This section explains architectural decisions made, with reasoning to reinforce our current approach.

### AWS Lambda

AWS Lambda is an event-driven, serverless compute service that runs code only when triggered and scales automatically.
It is a natural fit for this project because the booking workflow consists of short-lived, independent steps that each execute once and exit.
Lambda only incurs cost per invocation, meaning there is no charge when the system is idle, which keeps operating costs low.
It integrates natively with Step Functions, SQS, and API Gateway, so the functions can be wired together with minimal custom integration code.
Java Lambdas in this project also benefit from SnapStart, which snapshots the initialised runtime state to significantly reduce cold-start latency.
Alternatives such as ECS/Fargate, EKS, App Runner, and EC2 all require some form of always-on infrastructure, which adds both cost and management overhead that is unnecessary for this workload.

### AWS Step Functions

AWS Step Functions is a fully managed orchestration service that coordinates distributed workflows through a state machine.
It is well suited for the booking workflow because it provides built-in support for sequential task execution, error handling with retries and catch blocks, and timeout management.
The payment step uses the `waitForTaskToken` integration pattern, which allows the state machine to pause execution and resume asynchronously when the payment response arrives, without requiring any polling logic.
Step Functions incurs cost per state transition rather than per uptime hour, which aligns with the pay-per-use model of the rest of the architecture.
An alternative such as Camunda would require managed deployment, a separate integration layer for AWS services, and subscription-based licensing, adding complexity and cost without clear benefits for this use case.

### AWS SQS

AWS SQS is a fully managed message queuing service that decouples the payment request and response flows in the booking workflow.
It is serverless and scales automatically, so there are no brokers to provision or manage.
SQS integrates natively with Lambda through event source mappings, which means the `payment` and `PaymentResponseHandler` functions are triggered automatically when messages arrive on their respective queues, without any custom polling logic.
Messages are durably stored until processed, providing reliability without additional configuration.
The pay-per-request pricing model keeps costs proportional to actual usage.
An alternative such as Amazon MQ would offer protocol compatibility with RabbitMQ, but at the cost of managing broker instances and paying per uptime hour, which is unnecessary for this project.

### Amazon DynamoDB

Amazon DynamoDB is a fully managed, serverless NoSQL database that provides consistent performance at any scale.
It charges only per request under the pay-per-request billing mode, so there is no cost when the system is idle, which matches the usage pattern of the booking workflow.
Point-in-time recovery is enabled to protect against accidental data loss, and the table has a retain removal policy to prevent deletion on stack teardown.
DynamoDB requires no infrastructure management, no VPC configuration, and no connection pooling, making it straightforward to use from Lambda.
An alternative such as Amazon RDS would require a continuously running database instance, a VPC with private subnets and security groups, and VPC endpoints for Lambda connectivity, adding significant infrastructure complexity and ongoing cost.

### IAM

AWS IAM provides fine-grained, resource-level access control between all services in the architecture.
Each Lambda function is granted only the specific permissions it needs, enforcing the principle of least privilege across the entire stack.
Because all services used in this project (Lambda, SQS, Step Functions, DynamoDB, API Gateway) are fully managed and accessible through AWS service endpoints, IAM-based access control is sufficient to secure all communication.
There is no need for VPC-based network isolation, which eliminates the overhead of managing subnets, route tables, security groups, and NAT/VPC endpoints.
This also avoids the additional cold-start latency that VPC-attached Lambdas would incur, keeping response times low.
