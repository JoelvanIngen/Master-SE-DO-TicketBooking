import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sqs = new SQSClient({});
const lambda = new LambdaClient({});
const apiConfig = { endpoint: process.env.WS_API_ENDPOINT };

export const handler = async (event: any) => {
  const connectionId = event.requestContext.connectionId;
  const bookingReferenceId = event.requestContext.requestId;
  const body = JSON.parse(event.body);
  const simulateBookingFailure = body.simulateBookingFailure || 'none';

  let reservationId: string;

  // Mark as RUNNING for API lookups
  await ddb.send(
    new PutCommand({
      TableName: process.env.TABLE_NAME,
      Item: {
        bookingReferenceId,
        connectionId,
        simulateBookingFailure,
        status: 'RUNNING',
      },
    }),
  );

  // Reserve seats (sync)
  const reserveResponse = await lambda.send(
    new InvokeCommand({
      FunctionName: process.env.RESERVE_SEATS_FN,
      Payload: JSON.stringify({ simulateBookingFailure, bookingReferenceId }),
    }),
  );

  // AWS SDK returns HTTP 200 even on Lambda error, so we check FunctionError
  if (reserveResponse.FunctionError) {
    const payload = { bookingReferenceId, status: 'FAILED_SEATS_UNAVAILABLE', success: false };
    await ddb.send(
      new PutCommand({ TableName: process.env.TABLE_NAME, Item: { ...payload, connectionId } }),
    );
    await notifyWs(connectionId, payload);
    return { statusCode: 200 };
  }

  const reservePayload = JSON.parse(Buffer.from(reserveResponse.Payload!).toString());
  reservationId = reservePayload.reservationId;

  // Save reservationId
  await ddb.send(
    new PutCommand({
      TableName: process.env.TABLE_NAME,
      Item: {
        bookingReferenceId,
        connectionId,
        simulateBookingFailure,
        reservationId,
        status: 'RUNNING',
      },
    }),
  );

  // Request Payment (async)
  await sqs.send(
    new SendMessageCommand({
      QueueUrl: process.env.PAYMENT_REQUEST_QUEUE_URL,
      MessageBody: JSON.stringify({ bookingReferenceId }),
    }),
  );

  // Schedule 60-Second Timeout Fallback
  await sqs.send(
    new SendMessageCommand({
      QueueUrl: process.env.TIMEOUT_QUEUE_URL,
      MessageBody: JSON.stringify({ bookingReferenceId, connectionId, reservationId }),
      DelaySeconds: 60,
    }),
  );

  return { statusCode: 200 };
};

async function notifyWs(connectionId: string, payload: any) {
  const apiClient = new ApiGatewayManagementApiClient(apiConfig);
  try {
    await apiClient.send(
      new PostToConnectionCommand({ ConnectionId: connectionId, Data: JSON.stringify(payload) }),
    );
  } catch {
    console.warn(`WS Disconnected: ${connectionId}`);
  }
}
