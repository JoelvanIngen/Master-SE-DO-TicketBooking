FROM maven:3-amazoncorretto-25 AS builder

WORKDIR /app

COPY pom.xml .
RUN mvn dependency:go-offline

COPY src ./src
RUN mvn clean package -DskipTests


FROM amazoncorretto:25-alpine-jdk AS runner

WORKDIR /app

RUN addgroup -g 1001 -S app && \
    adduser -S app -u 1001 -G app && \
    chown -R app:app /app

USER app

COPY --from=builder --chown=app:app /app/target/ticket-booking-*.jar app.jar

EXPOSE 8080

CMD ["java", "-jar", "app.jar"]
