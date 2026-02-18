# Architecture

## Compute
[AWS Fargate](https://aws.amazon.com/fargate/) + [AWS Elastic Container Service](https://aws.amazon.com/ecs/) + [AWS Auto Scaling](https://aws.amazon.com/autoscaling/) (Note: Fargate might actually contain auto scaling as a feature instead of an independent service but couldn't find documentation on that)

### AWS Fargate
Fargate is a serverless, pay-as-you-go solution that takes away the burden of managing individual servers [*source*](https://aws.amazon.com/fargate/).
When combined with AWS Auto Scaling, changes in demand automatically scale resources [*source*](https://aws.amazon.com/ecs/).

### AWS Elastic Container Registry
AWS ECS integrates with many AWS services and aims to reduce infrastructure management [*source*](https://aws.amazon.com/ecs/).
Combined with AWS Fargate, it should be possible to easily spin up serverless instances of necessary Docker containers.
We should be able to write a GitHub Actions script that automatically pushes the Github repository to AWS ECS, but since we're not going to develop the codebase itself, that might be a bit pointless.

### Why not Kubernetes?
While AWS Elastic Kubernetes Service (EKS) exists, it is much more pricey than Fargate + ECS, and the added configurability provided are mostly advanced settings that will not be used during this project.

### Why not AWS Lambda?
[AWS Lambda](https://aws.amazon.com/lambda/) would be cheaper for low traffic as no expenses are recorded when no one is booking tickets.
However, since we are using Camunda, the workers need to stay connected to listen for jobs.
AWS Lambda is made for executing quick tasks and shutting down, not for long-term connections.

### Worth looking at AWS App Runner?
[AWS App Runner](https://aws.amazon.com/apprunner/) builds and deploys web applications automatically load balances traffic with encryption, scales to meet traffic needs and allow communication to other AWS applications within a VPC [*source*](https://aws.amazon.com/apprunner/).
It handles a lot of manual work for us [*source*](https://docs.aws.amazon.com/apprunner/latest/dg/what-is-apprunner.html) so it might be worth looking into.
However, it is mainly made for web apps and APIs, so while it might work well for the Java API, using it for the TS backend might run us into issues later.
Furthermore, since it might auto-pause the process when no requests are made, the connection with Camunda might run into issues.
Fargate is probably the safer bet.

### Full serverless (for report)
Very probably outside our scope, but we could mention in the report that a full serverless option would be to
- Replace RabbitMQ/Amazon MQ with [AWS SQS](https://aws.amazon.com/sqs/)
- Use [AWS Lambda](https://aws.amazon.com/lambda/) to process messages

This would require rewriting the code to be compatible with AWS SQS and to not break the Camunda connections.
However, it would allow much more AWS-native, more scalable, full serverless, and low maintenance deployment.
We should at least write about it in the report, so they can see we've considered other options.

## Secrets
Secrets are hardcoded in files like the application.properties file, but we shouldn't put those in the container, but use [AWS Secrets Manager](https://aws.amazon.com/secrets-manager/) instead, which should integrate with all other AWS services here.

## Load Balancing
[AWS Load Balancing](https://aws.amazon.com/elasticloadbalancing/) seems to be the only AWS solution for this purpose and should fit our case.
