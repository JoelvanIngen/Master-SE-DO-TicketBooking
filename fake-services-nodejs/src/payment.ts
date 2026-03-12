import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { v4 as uuidv4 } from 'uuid';

const sqs = new SQSClient({});

/**
 * Receives message from SQS to process payment, and sends message back containing confirmation
 */
export const handler = async (event: any) => {
  for (const record of event.Records) {
    const { bookingReferenceId } = JSON.parse(record.body);

    await sqs.send(
      new SendMessageCommand({
        QueueUrl: process.env.PAYMENT_RESPONSE_QUEUE_URL,
        MessageBody: JSON.stringify({
          bookingReferenceId,
          paymentConfirmationId: uuidv4(),
        }),
      }),
    );
  }
};
