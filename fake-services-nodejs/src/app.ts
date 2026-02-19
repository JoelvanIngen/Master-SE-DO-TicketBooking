import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { v4 as uuidv4 } from "uuid";

// Initialize AWS Clients outside the handler scope for reuse during warm starts
const sqsClient = new SQSClient({});

// Environment variables configuration
const PAYMENT_RESPONSE_QUEUE_URL = process.env.PAYMENT_RESPONSE_QUEUE_URL || "";


////////////////////////////////////
// FAKE SEAT RESERVATION
// Trigger: AWS Step Functions Task
////////////////////////////////////
export const reserveSeatsHandler = async (event: any) => {
  console.log("\n\n Reserve seats now...");
  console.log("Input Event:", event);

  // Step Functions passes the input as the event payload.
  // Logic: Simulate booking failure if simulateBookingFailure is "seats"
  if (event.simulateBookingFailure === "seats") {
    console.log("ERROR: Seats could not be reserved!");
    // In Step Functions, throwing an error triggers the Catch block in the ASL definition
    throw new Error("ErrorSeatsNotAvailable");
  }

  console.log("Successful :-)");

  // Return value becomes the output of the Step Function state
  return {
    reservationId: "1234",
  };
};


////////////////////////////////////
// FAKE PAYMENT SERVICE
// Trigger: AWS SQS (Payment Request Queue)
////////////////////////////////////
export const paymentHandler = async (event: any) => {
  // SQS triggers Lambda with a list of records
  for (const record of event.Records) {
    const paymentRequestId = record.body;
    const paymentConfirmationId = uuidv4();

    console.log("\n\n [x] Received payment request %s", paymentRequestId);

    const outputMessage = JSON.stringify({
      paymentRequestId: paymentRequestId,
      paymentConfirmationId: paymentConfirmationId,
    });

    // Send response to the Payment Response Queue
    try {
      const command = new SendMessageCommand({
        QueueUrl: PAYMENT_RESPONSE_QUEUE_URL,
        MessageBody: outputMessage,
      });

      await sqsClient.send(command);
      console.log(" [x] Sent payment response %s", outputMessage);
    } catch (error) {
      console.error("Failed to send payment response to SQS", error);
      // Maybe throw again?
    }
  }
};


////////////////////////////////////
// FAKE TICKET GENERATION
// Trigger: AWS Lambda Function URL or API Gateway
////////////////////////////////////
export const ticketHandler = async (event: any) => {
  // This handler expects to be triggered via HTTP (API Gateway / Function URL)
  // The event structure differs from SQS/StepFunctions.

  const ticketId = uuidv4();
  console.log("\n\n [x] Create Ticket %s", ticketId);

  // Return API Gateway Proxy Integration response format
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ticketId: ticketId,
    }),
  };
};