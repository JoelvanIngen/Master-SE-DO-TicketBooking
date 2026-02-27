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
AWS SQS manages message parsing between functions.

### Networking & Security
Amazon VPC is used to allow secure communication between services for functions deployed inside, and to allow access to private resources.
Security groups are applied to control traffic flow between the Lambda Functions, SQS, and the database.
Amazon RDS is used as database to keep persistent booking data.
AWS Secrets Manager is used to inject environment variables that should not be publicised in public locations.


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
Camunda is inferior to Step Functions for this project for multiple reasons.
- Camunda is designed for complex logic, user tasks, extensive business rules, and visual modelling for stakeholders.
  Step functions is simpler, and covers all needs for this project.
- Camunda requires managed deployment, which adds to deployment complexity.
  Step Functions is a fully AWS-managed service, with no infrastructure to manage.
- Step Functions integrates better with the AWS ecosystem, and directly invokes SQS, ECS, and Lambda.
  Camunda is platform-agnostic, requiring a separate integration layer.
- Camunda, when hosted on the cloud, requires subscription-based payment.
  Step Functions incurs cost per usage, and is likely cheaper for this project.
- Camunda requires a permanent connection to at least one instance of each workflow node,
  forcing the architecture towards a less-suitable deployment solution (such as EC2, Fargate, or EKS).
  Step Functions allows (and is even built for) short-running functions such as AWS Lambda.
