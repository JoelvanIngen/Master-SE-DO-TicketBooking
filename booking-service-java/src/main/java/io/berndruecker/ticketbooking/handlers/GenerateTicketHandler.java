package io.berndruecker.ticketbooking.handlers;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.berndruecker.ticketbooking.ProcessConstants;
import java.util.Collections;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import software.amazon.awssdk.core.SdkBytes;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.lambda.LambdaClient;
import software.amazon.awssdk.services.lambda.model.InvokeRequest;
import software.amazon.awssdk.services.lambda.model.InvokeResponse;

public class GenerateTicketHandler
        implements RequestHandler<Map<String, Object>, Map<String, Object>> {

    private static final Logger logger = LoggerFactory.getLogger(GenerateTicketHandler.class);
    private static final ObjectMapper objectMapper =
            new ObjectMapper().configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
    private static final LambdaClient lambdaClient =
            LambdaClient.builder().region(Region.of(System.getenv("AWS_REGION"))).build();

    // Lambda ticket gen function name
    public static final String FUNCTION_NAME = System.getenv("TICKETGEN_FUNCTION_NAME");

    @Override
    public Map<String, Object> handleRequest(Map<String, Object> input, Context context) {
        logger.info("Generate ticket via Lambda Function Invoke [" + input + "]");

        try {
            if ("ticket"
                    .equalsIgnoreCase(
                            (String) input.get(ProcessConstants.VAR_SIMULATE_BOOKING_FAILURE))) {

                // Simulate a network problem to the ticket generation service
                throw new RuntimeException(
                        "[Simulated] Could not connect to ticket generation server");

            } else {

                String payload = objectMapper.writeValueAsString(input);

                InvokeRequest invokeRequest =
                        InvokeRequest.builder()
                                .functionName(FUNCTION_NAME)
                                .payload(SdkBytes.fromUtf8String(payload))
                                .build();

                InvokeResponse response = lambdaClient.invoke(invokeRequest);

                if (response.functionError() != null) {
                    throw new RuntimeException(
                            "TicketGen Lambda returned an error: " + response.functionError());
                }

                String responseString = response.payload().asUtf8String();

                CreateTicketResponse ticket =
                        objectMapper.readValue(responseString, CreateTicketResponse.class);
                logger.info("Succeeded with " + ticket);

                return Collections.singletonMap(ProcessConstants.VAR_TICKET_ID, ticket.ticketId);
            }
        } catch (Exception e) {
            logger.error("Error invoking ticket service", e);
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
