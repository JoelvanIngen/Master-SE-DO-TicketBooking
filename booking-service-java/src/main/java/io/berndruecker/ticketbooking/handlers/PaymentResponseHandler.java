package io.berndruecker.ticketbooking.handlers;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.amazonaws.services.lambda.runtime.events.SQSEvent;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.berndruecker.ticketbooking.ProcessConstants;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.sfn.SfnClient;
import software.amazon.awssdk.services.sfn.model.SendTaskSuccessRequest;

import java.util.Collections;

public class PaymentResponseHandler implements RequestHandler<SQSEvent, Void> {

    private static final Logger logger = LoggerFactory.getLogger(PaymentResponseHandler.class);
    private static final ObjectMapper objectMapper = new ObjectMapper();
    private static final SfnClient sfnClient = SfnClient.builder()
            .region(Region.of(System.getenv("AWS_REGION")))
            .build();

    @Override
    public Void handleRequest(SQSEvent event, Context context) {
        for (SQSEvent.SQSMessage msg : event.getRecords()) {
            try {
                String paymentResponseString = msg.getBody();
                PaymentResponseMessage paymentResponse = objectMapper.readValue(paymentResponseString, PaymentResponseMessage.class);
                logger.info("Received " + paymentResponse);

                // Route message to workflow using the Task Token
                String outputVariables = objectMapper.writeValueAsString(
                        Collections.singletonMap(ProcessConstants.VAR_PAYMENT_CONFIRMATION_ID, paymentResponse.paymentConfirmationId)
                );

                SendTaskSuccessRequest successRequest = SendTaskSuccessRequest.builder()
                        .taskToken(paymentResponse.taskToken)
                        .output(outputVariables)
                        .build();

                sfnClient.sendTaskSuccess(successRequest);

            } catch (Exception e) {
                logger.error("Error processing payment response message", e);
                throw new RuntimeException(e);
            }
        }
        return null;
    }

    public static class PaymentResponseMessage {
        public String paymentRequestId;
        public String paymentConfirmationId;
        public String taskToken;

        @Override
        public String toString() {
            return "PaymentResponseMessage [paymentRequestId=" + paymentRequestId + ", paymentConfirmationId=" + paymentConfirmationId + "]";
        }
    }
}