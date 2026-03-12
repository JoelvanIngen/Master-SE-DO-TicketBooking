import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { unmarshall } from '@aws-sdk/util-dynamodb';

const sqs = new SQSClient({});

/**
 * Fires on DDB actions, and chooses next action based on status
 * Basically a state machine, but orders of magnitude cheaper than step functions :)
 */
export const handler = async (event: any) => {
  await Promise.all(
    event.Records.map(async (record: any) => {
      if (record.eventName !== 'INSERT' && record.eventName !== 'MODIFY') {
        return;
      }

      // Convert JSON to standard JS
      // A bit hacky but we want to prevent non-changes from firing messaging
      const newImage = unmarshall(record.dynamodb.NewImage as any);
      const oldImage = record.dynamodb.OldImage
        ? unmarshall(record.dynamodb.OldImage as any)
        : null;
      const isInsert = record.eventName === 'INSERT';
      const hasStatusChanged = isInsert || (oldImage && oldImage.status !== newImage.status);

      if (!hasStatusChanged) return;

      const { bookingReferenceId, connectionId, simulateBookingFailure, status } = newImage;

      // Route based on new status
      switch (status) {
        case 'PENDING':
          await Promise.all([
            sqs.send(
              new SendMessageCommand({
                QueueUrl: process.env.SEAT_RESERVATION_REQUEST_QUEUE_URL,
                MessageBody: JSON.stringify({ bookingReferenceId, simulateBookingFailure }),
              }),
            ),
            sqs.send(
              new SendMessageCommand({
                QueueUrl: process.env.TIMEOUT_QUEUE_URL,
                MessageBody: JSON.stringify({ bookingReferenceId }),
                DelaySeconds: 60,
              }),
            ),
          ]);
          break;

        case 'SEATS_RESERVED':
          await sqs.send(
            new SendMessageCommand({
              QueueUrl: process.env.PAYMENT_REQUEST_QUEUE_URL,
              MessageBody: JSON.stringify({ bookingReferenceId }),
            }),
          );
          break;

        case 'PAYMENT_COMPLETED':
          await sqs.send(
            new SendMessageCommand({
              QueueUrl: process.env.TICKET_GEN_REQUEST_QUEUE_URL,
              MessageBody: JSON.stringify({ bookingReferenceId, simulateBookingFailure }),
            }),
          );
          break;

        case 'COMPLETED':
        case 'FAILED_SEATS_UNAVAILABLE':
        case 'FAILED_TICKET_ERROR':
        case 'FAILED_PAYMENT_TIMEOUT':
          // Terminal states
          const payload = {
            bookingReferenceId,
            status,
            success: status === 'COMPLETED',
            reservationId: newImage.reservationId,
            paymentConfirmationId: newImage.paymentConfirmationId,
            ticketId: newImage.ticketId,
          };
          await sqs.send(
            new SendMessageCommand({
              QueueUrl: process.env.NOTIFICATION_QUEUE_URL,
              MessageBody: JSON.stringify({ connectionId, payload }),
            }),
          );
          break;
      }
    }),
  );
};
