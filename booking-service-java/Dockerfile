FROM maven:3-amazoncorretto-25 AS builder

WORKDIR /app

COPY pom.xml .
RUN mvn dependency:go-offline

COPY src ./src
RUN mvn clean package -DskipTests


FROM public.ecr.aws/lambda/java:25

WORKDIR ${LAMBDA_TASK_ROOT}

# Compiled class files
COPY --from=builder /app/target/classes ${LAMBDA_TASK_ROOT}

# Dependency jars
COPY --from=builder /app/target/lib/*.jar ${LAMBDA_TASK_ROOT}/lib/

# JVM optimizations for Lambda cold starts
ENV JAVA_TOOL_OPTIONS="-XX:+TieredCompilation -XX:TieredStopAtLevel=1"

# The CMD can be overridden for each Lambda function.
# We provide a default here
CMD ["io.berndruecker.ticketbooking.handlers.GenerateTicketHandler::handleRequest"]