package io.berndruecker.ticketbooking.handlers;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.berndruecker.ticketbooking.ProcessConstants;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Collections;
import java.util.Map;

public class GenerateTicketHandler implements RequestHandler<Map<String, Object>, Map<String, Object>> {

    private static final Logger logger = LoggerFactory.getLogger(GenerateTicketHandler.class);
    private static final ObjectMapper objectMapper = new ObjectMapper()
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
    private static final HttpClient httpClient = HttpClient.newHttpClient();

    // This should be of course injected and depends on the environment.
    // Hard coded for simplicity here
    public static String ENDPOINT = "http://fake-services:3000/ticket";

    @Override
    public Map<String, Object> handleRequest(Map<String, Object> input, Context context) {
        logger.info("Generate ticket via REST [" + input + "]");

        try {
            if ("ticket".equalsIgnoreCase((String) input.get(ProcessConstants.VAR_SIMULATE_BOOKING_FAILURE))) {

                // Simulate a network problem to the HTTP server
                // AWS prefers RuntimeExceptions, so reshape
                throw new RuntimeException(new IOException("[Simulated] Could not connect to HTTP server"));

            } else {

                // Call REST API, simply returns a ticketId
                HttpRequest request = HttpRequest.newBuilder()
                        .uri(URI.create(ENDPOINT))
                        .GET()
                        .build();

                HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

                if (response.statusCode() != 200) {
                    throw new RuntimeException("REST service returned HTTP " + response.statusCode());
                }

                CreateTicketResponse ticket = objectMapper.readValue(response.body(), CreateTicketResponse.class);
                logger.info("Succeeded with " + ticket);

                return Collections.singletonMap(ProcessConstants.VAR_TICKET_ID, ticket.ticketId);
            }
        } catch (IOException | InterruptedException e) {
            logger.error("Error calling ticket service", e);
            // AWS prefers RuntimeExceptions, so reshape
            throw new RuntimeException(e);
        }
    }

    public static class CreateTicketResponse {
        public String ticketId;

        @Override
        public String toString() {
            return "CreateTicketResponse [ticketId=" + ticketId + "]";
        }
    }
}