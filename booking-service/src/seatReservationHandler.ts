import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { notifyWs } from './utils';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sqs = new SQSClient({});
const lambda = new LambdaClient({});

export const handler = async (event: any) => {
  for (const record of event.Records) {
    const { bookingReferenceId } = JSON.parse(record.body);

    // Get current state
    const { Item } = await ddb.send(
      new GetCommand({ TableName: process.env.TABLE_NAME, Key: { bookingReferenceId } }),
    );

    // Abort if missing or already timed out
    if (!Item || Item.status !== 'PENDING') continue;

    const reserveResponse = await lambda.send(
      new InvokeCommand({
        FunctionName: process.env.RESERVE_SEATS_FN,
        Payload: JSON.stringify({
          simulateBookingFailure: Item.simulateBookingFailure,
          bookingReferenceId,
        }),
      }),
    );

    if (reserveResponse.FunctionError) {
      const payload = { bookingReferenceId, status: 'FAILED_SEATS_UNAVAILABLE', success: false };

      try {
        await ddb.send(
          new UpdateCommand({
            TableName: process.env.TABLE_NAME,
            Key: { bookingReferenceId },
            UpdateExpression: 'SET #st = :status, success = :success',
            ConditionExpression: '#st = :pending',
            ExpressionAttributeNames: { '#st': 'status' },
            ExpressionAttributeValues: {
              ':status': payload.status,
              ':success': false,
              ':pending': 'PENDING',
            },
          }),
        );
        await notifyWs(Item.connectionId, payload);
      } catch (err: any) {
        if (err.name !== 'ConditionalCheckFailedException') throw err;
      }
      continue;
    }

    const { reservationId } = JSON.parse(Buffer.from(reserveResponse.Payload!).toString());

    try {
      // Only update if it is still 'PENDING'
      await ddb.send(
        new UpdateCommand({
          TableName: process.env.TABLE_NAME,
          Key: { bookingReferenceId },
          UpdateExpression: 'SET #st = :newStatus, reservationId = :resId',
          ConditionExpression: '#st = :pending',
          ExpressionAttributeNames: { '#st': 'status' },
          ExpressionAttributeValues: {
            ':newStatus': 'SEATS_RESERVED',
            ':resId': reservationId,
            ':pending': 'PENDING',
          },
        }),
      );

      // Trigger payment
      await sqs.send(
        new SendMessageCommand({
          QueueUrl: process.env.PAYMENT_REQUEST_QUEUE_URL,
          MessageBody: JSON.stringify({ bookingReferenceId }),
        }),
      );
    } catch (err: any) {
      // If ConditionalCheckFailed we're timed out, ignore
      if (err.name !== 'ConditionalCheckFailedException') throw err;
    }
  }
};
