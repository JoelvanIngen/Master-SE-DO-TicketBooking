package io.berndruecker.ticketbooking.handlers;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.berndruecker.ticketbooking.ProcessConstants;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import software.amazon.awssdk.services.sqs.SqsClient;
import software.amazon.awssdk.services.sqs.model.SendMessageRequest;

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

public class RetrievePaymentHandler implements RequestHandler<Map<String, Object>, Map<String, Object>> {

    private static final Logger logger = LoggerFactory.getLogger(PaymentResponseHandler.class);
    private static final ObjectMapper objectMapper = new ObjectMapper();
    private static final SqsClient sqsClient = SqsClient.create();

    public static final String SQS_QUEUE_URL = System.getenv("PAYMENT_REQUEST_QUEUE_URL");

    @Override
    public Map<String, Object> handleRequest(Map<String, Object> input, Context context) {
        logger.info("Send message to retrieve payment [" + input + "]");

        // Create correlation id for this request/response cycle
        String paymentRequestId = UUID.randomUUID().toString();

        // TaskToken is required to resume the Step Function later.
        // It's passed in from the ASL definition with "$$.Task.Token"
        String taskToken = (String) input.get("taskToken");

        try {
            Map<String, String> messagePayload = new HashMap<>();
            messagePayload.put("paymentRequestId", paymentRequestId);
            messagePayload.put("taskToken", taskToken);

            // Send SQS Message
            sqsClient.sendMessage(SendMessageRequest.builder()
                    .queueUrl(SQS_QUEUE_URL)
                    .messageBody(objectMapper.writeValueAsString(messagePayload))
                    .build());

            return Collections.singletonMap(ProcessConstants.VAR_PAYMENT_REQUEST_ID, paymentRequestId);

        } catch (Exception e) {
            logger.error("Failed to send payment request to SQS", e);
            throw new RuntimeException("Could not initiate payment retrieval", e);
        }
    }
}