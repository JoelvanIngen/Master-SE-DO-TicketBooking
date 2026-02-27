# Cloud-Native Ticket Booking System


This project is a ticket booking application designed to run on the cloud.
It uses a Microservice architecture.

The goal of this project is to demonstrate a production-ready setup using AWS services.
It ensures the application is scalable, reliable, and cost-aware.

## System Architecture
The system is deployed inside a Virtual Private Cloud (VPC) on AWS to ensure security.

![Architecture Diagram](./diagram(2).png)

### Short Architecture Overview
The application is run using AWS Step Functions, which coordinates Lambda Functions that communicate via SQS and Lambda Invocations.
AWS RDS is used as database.

## Automation (CI/CD)
We use **GitHub Actions** to automate the deployment process:
1.  Build: Compiles the code and allows for running tests.
2.  Package: Stores artifacts of the compiled code.
3.  Deploy: Uploads the images to AWS Lambda Functions, making them ready for deployment.

## Testing
When deployed, a ticket can be generated as follows:
```
curl -i -X PUT "https://REDACTED.lambda-url.eu-north-1.on.aws/ticket"
```

Two types of simulated failures are currently supported, and they can be tested using
```
curl -i -X PUT "https://REDACTED.lambda-url.eu-north-1.on.aws/ticket?simulateBookingFailure=seats"
```
```
curl -i -X PUT "https://REDACTED.lambda-url.eu-north-1.on.aws/ticket?simulateBookingFailure=ticket"
```
