import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { v4 as uuidv4 } from 'uuid';

const sqs = new SQSClient({});

/**
 * Receives message from SQS to generate ticket, and sends message back containing ticket ID
 */
export const handler = async (event: any) => {
  for (const record of event.Records) {
    const { bookingReferenceId, simulateBookingFailure } = JSON.parse(record.body);
    const success = simulateBookingFailure !== 'ticket';

    await sqs.send(
      new SendMessageCommand({
        QueueUrl: process.env.TICKET_GEN_RESPONSE_QUEUE_URL,
        MessageBody: JSON.stringify({
          bookingReferenceId,
          success,
          ticketId: success ? uuidv4() : undefined,
        }),
      }),
    );
  }
};
