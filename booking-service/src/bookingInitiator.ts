import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sqs = new SQSClient({});

/**
 * Receives incoming WebSocket and starts workflow
 */
export const handler = async (event: any) => {
  const connectionId = event.requestContext.connectionId;
  const bookingReferenceId = event.requestContext.requestId;
  const body = JSON.parse(event.body);
  const simulateBookingFailure = body.simulateBookingFailure || 'none';

  // Initialise DDB Entry (automatically starts the router)
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

  // Tell client their booking reference ID
  await sqs.send(
    new SendMessageCommand({
      QueueUrl: process.env.NOTIFICATION_QUEUE_URL,
      MessageBody: JSON.stringify({
        connectionId,
        payload: {
          bookingReferenceId,
          status: 'PENDING',
        },
      }),
    }),
  );

  return { statusCode: 200 };
};
