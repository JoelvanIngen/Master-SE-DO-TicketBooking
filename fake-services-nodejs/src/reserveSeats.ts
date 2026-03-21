import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { v4 as uuidv4 } from 'uuid';

const sqs = new SQSClient({});

/**
 * Receives message from SQS to reserve a seat, does so (to-do, still hardcoded at this moment), and sends message back
 */
export const handler = async (event: any) => {
  for (const record of event.Records) {
    const { bookingReferenceId, simulateBookingFailure } = JSON.parse(record.body);
    const success = simulateBookingFailure !== 'seats';

    await sqs.send(
      new SendMessageCommand({
        QueueUrl: process.env.SEAT_RESERVATION_RESPONSE_QUEUE_URL,
        MessageBody: JSON.stringify({
          bookingReferenceId,
          success,
          reservationId: success ? uuidv4() : undefined,
        }),
      }),
    );
  }
};
