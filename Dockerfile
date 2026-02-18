# Stage 1: Build the application
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /app

# COPY pom.xml from the subdirectory to the Docker image
COPY booking-service-java/pom.xml .

# COPY the source code from the subdirectory
COPY booking-service-java/src ./src

# Compile and package (skipping tests since CI handles them)
RUN mvn clean package -DskipTests

# Stage 2: Create the runtime image
FROM eclipse-temurin:17-jre-alpine
WORKDIR /app

# Copy the built jar from the 'build' stage
# Note: The path /app/target/ is correct because we built it inside /app in Stage 1
COPY --from=build /app/target/*.jar app.jar

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
