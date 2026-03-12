import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

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

  return { statusCode: 200 };
};
