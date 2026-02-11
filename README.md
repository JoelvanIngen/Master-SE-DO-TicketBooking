# Ticket Booking

flowchart TB
    %% External Entities
    Users([External Users])
    Camunda[Camunda 8 SaaS \n Workflow Engine]

    %% Cloud Infrastructure
    subgraph CloudProvider ["Cloud Provider (e.g., AWS)"]
        subgraph VPC ["Virtual Private Cloud (VPC)"]
            
            %% Public Subnet
            subgraph Public ["Public Subnet"]
                LB[Application Load Balancer]
                Grafana[Grafana Dashboard]
                NAT[NAT Gateway]
            end

            %% Private Subnet
            subgraph Private ["Private Subnet"]
                subgraph Compute ["Compute Cluster (EKS/ECS)"]
                    Seat[Seat Reservation Service]
                    Pay[Payment Service]
                    Ticket[Ticket Generation Service]
                end
                
                MQ[(Managed Message Broker \n AMQP)]
                DB[(Relational Database \n PostgreSQL)]
                Prometheus[Prometheus \n Metrics Scraper]
            end
        end
    end

    %% Routing and Communication Flow
    Users -->|Initiate Request| LB
    LB -->|REST| Ticket
    
    Camunda <-->|gRPC / PubSub| Seat
    Camunda -->|Commands / Events| Pay
    Pay <-->|AMQP| MQ
    
    Seat -->|Read/Write State| DB
    Ticket -->|Read/Write State| DB

    %% Outbound internet access for private resources
    Compute -->|External API Calls| NAT
    NAT --> Camunda

    %% Observability
    Prometheus -.->|Scrapes Resource & App Metrics| Compute
    Grafana -.->|Queries Data| Prometheus