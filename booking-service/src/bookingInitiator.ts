import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sqs = new SQSClient({});

export const handler = async (event: any) => {
  const connectionId = event.requestContext.connectionId;
  const bookingReferenceId = event.requestContext.requestId;
  const body = JSON.parse(event.body);
  const simulateBookingFailure = body.simulateBookingFailure || 'none';

  // Mark as RUNNING for API lookups
  await ddb.send(
    new PutCommand({
      TableName: process.env.TABLE_NAME,
      Item: {
        bookingReferenceId,
        connectionId,
        simulateBookingFailure,
        status: 'PENDING',
      },
    }),
  );

  // Reserve seats
  await sqs.send(
    new SendMessageCommand({
      QueueUrl: process.env.SEAT_RESERVATION_QUEUE_URL,
      MessageBody: JSON.stringify({ bookingReferenceId }),
    }),
  );

  // Schedule 60-Second Timeout Fallback
  await sqs.send(
    new SendMessageCommand({
      QueueUrl: process.env.TIMEOUT_QUEUE_URL,
      MessageBody: JSON.stringify({ bookingReferenceId, connectionId }),
      DelaySeconds: 60,
    }),
  );

  return { statusCode: 200 };
};
