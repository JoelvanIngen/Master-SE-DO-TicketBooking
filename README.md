# Cloud-Native Ticket Booking System

This project is a ticket booking application designed to run on the cloud.
It uses a Microservice architecture.

The goal of this project is to demonstrate a production-ready setup using AWS services.
It ensures the application is scalable, reliable, and cost-aware.

## System Architecture

The system is deployed inside a Virtual Private Cloud (VPC) on AWS to ensure security.

![Architecture Diagram](./aws_architecture.png)

### Short Architecture Overview

The application is run using AWS Step Functions, which coordinates Lambda Functions that communicate via SQS and Lambda Invocations.
AWS RDS is used as database.

## Automation (CI/CD)

We use GitHub Actions to automate the deployment process:

1.  Build: Compiles the code and allows for running tests.
2.  Package: Stores artifacts of the compiled code.
3.  Deploy: Uploads the images to AWS Lambda Functions, making them ready for deployment.

## Testing

When the stack is deployed on AWS, several tests can be performed.

### Example Client

An example client can be deployed by navigating to `/examples` and running

`npx serve .`

In a browser, navigate to `localhost:3000` and open the client.
From there, follow the instructions on the webpage.

### WebSocket cat

Using `wscat`, a WebSocket connection can be instantiated from the terminal with

```
wscat -c [WSS_URL]
```

Keep in mind that the required URL is the WebSocket endpoint, not the HTTP endpoint.

A ticket can be requestion by sending

```
{"action": "bookTicket"}
```

Alternatively, simulated booking errors can be triggered with

```
{"action": "bookTicket", "simulateBookingFailure": "seats"}
```

```
{"action": "bookTicket", "simulateBookingFailure": "ticket"}
```

A connection can be terminated with `ctrl-C`.

### HTTP Fallback

The API contains an HTTP endpoint that can be polled in case WebSocket connection is lost.

The `bookingReferenceId` must be obtained via WebSocket, but if the connection is terminated before results are received, they can be polled from

```
curl -i -X GET [HTTP_URL]/ticket/{bookingReferenceId}
```

### Load tests

To simulate various levels of load, the `artillery` package can be used to execute load tests found in `tests/load_tests`:

```
cd tests/load_tests/
WSS_URL=[WSS_URL] artillery run -e [name] load_test.yaml
```

The WSS_URL environment variable must be set, and must include the `/prod` path suffix.
