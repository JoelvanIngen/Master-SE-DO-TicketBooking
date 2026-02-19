# Cloud-Native Ticket Booking System

## 1. Project Overview
This project is a ticket booking application designed to run on the cloud. It uses a **Microservice** architecture separating the Java and Camunda logic from the Node.js fake services logic.

The goal of this project is to demonstrate a production-ready setup using **AWS services**. It ensures the application is scalable, reliable, and cost-aware.

## 2. System Architecture
The system is deployed inside a Virtual Private Cloud (VPC) on AWS to ensure security.

![Architecture Diagram](./diagram(2).png)

### Key Architectural Decisions
* **Containerization:** The application is packaged in Docker containers so it runs the same way on a developer's laptop as it does in the cloud.
* **Orchestration:** We use **Camunda 8** as a workflow engine to manage the state of each booking. This ensures that if a service crashes during a transaction, the process can resume exactly where it left off.
* **Managed Services:** Instead of hosting our own databases and message brokers, we use AWS managed services (RDS and Amazon MQ) to reduce maintenance and improve uptime.

## 3. Technical Components

The project consists of the following key components:

### Compute & Application
* **Amazon ECS (Elastic Container Service):** The fully managed container orchestration service used to deploy, manage, and scale the application containers.
* **AWS Fargate:** The serverless compute engine for containers. It removes the need to provision, configure, and manage underlying virtual servers, automatically handling the infrastructure required to run the application containers in a secure and isolated environment.
* **Java App (Booking Service):** A Spring Boot application that starts the booking process and manages Camunda.
* **Node.js App (Worker Service):** A Node.js application that processes seat reservations, payments, and generates ticket IDs.

### Data & Messaging
* **Amazon RDS (PostgreSQL):** A managed database used to store booking data and flight inventory.
* **Amazon MQ (RabbitMQ):** A message broker that allows the Java and Node.js services to communicate asynchronously. This ensures that if the Node.js service is busy or offline, the Java service can still accept bookings.

### Monitoring & Analysis
* **Amazon CloudWatch:** We use AWS's native monitoring service instead of managing external tools. CloudWatch automatically collects metrics (like CPU usage and memory) and logs directly from the Fargate container tasks. It provides built-in dashboards to visualize the health of the application in real-time.

## 4. Communication Protocols
The services communicate using specific protocols chosen for efficiency and reliability:

1.  **gRPC:** Used to connect the application pods to **Camunda**. This allows for high-performance streaming of tasks.
2.  **AMQP:** Used to send messages to **Amazon MQ**. This is "fire and forget," i.e., the sender doesn't need to wait for a response.
3.  **REST (HTTP/HTTPS):** Used for user traffic. The **Application Load Balancer (ALB)** receives internet requests and routes them directly to the active containers.

## 5. Network & Security
To keep the system secure, we use a strict network structure:

* **Public Subnet:** Contains the **Application Load Balancer (ALB)** and **NAT Gateway**. This is the only part of the network accessible from the internet.
* **Private Subnet:** Contains the **ECS Fargate Tasks** (running Java/Node.js apps) and the database. These resources cannot be reached directly from the internet. They use the NAT Gateway to send data out (e.g., to Camunda) but do not accept incoming connections from outside.

## 6. Automation (CI/CD)
We use **GitHub Actions** to automate the deployment process:
1.  **Build:** Compiles the code and runs tests.
2.  **Package:** Builds Docker images for the Java and Node.js services.
3.  **Push:** Uploads the images to **Amazon ECR** (Elastic Container Registry), making them ready for deployment to the Amazon ECS cluster.
