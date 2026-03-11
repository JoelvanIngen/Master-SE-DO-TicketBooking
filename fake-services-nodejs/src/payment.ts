import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { v4 as uuidv4 } from 'uuid';

const sqsClient = new SQSClient({});
const QUEUE_URL = process.env.PAYMENT_RESPONSE_QUEUE_URL;

/**
 * - Receives: taskToken, paymentRequestId as sent by State Machine
 * - Generates: paymentConfirmationId
 * - Sends: taskToken, paymentRequestId, paymentConfirmationId as expected by PaymentResponseHandler.java
 */
export const handler = async (event: any) => {
  for (const record of event.Records) {
    // Parse incoming message
    const incomingBody = JSON.parse(record.body);

    // Generate ID
    const paymentConfirmationId = uuidv4();

    // Construct response using incoming data
    const outgoingPayload = {
      paymentConfirmationId: paymentConfirmationId,
      taskToken: incomingBody.taskToken,
      paymentRequestId: incomingBody.paymentRequestId,
    };

    // Send :)
    await sqsClient.send(
      new SendMessageCommand({
        QueueUrl: QUEUE_URL,
        MessageBody: JSON.stringify(outgoingPayload),
      }),
    );
  }
};
