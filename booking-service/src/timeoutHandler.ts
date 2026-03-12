import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { notifyWs } from './utils';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = async (event: any) => {
  for (const record of event.Records) {
    const { bookingReferenceId, connectionId } = JSON.parse(record.body);

    try {
      // Only transition to Timeout if it is still PENDING or SEATS_RESERVED
      await ddb.send(
        new UpdateCommand({
          TableName: process.env.TABLE_NAME,
          Key: { bookingReferenceId },
          UpdateExpression: 'SET #st = :failed, success = :suc',
          ConditionExpression: '#st IN (:pending, :reserved)',
          ExpressionAttributeNames: { '#st': 'status' },
          ExpressionAttributeValues: {
            ':failed': 'FAILED_PAYMENT_TIMEOUT',
            ':suc': false,
            ':pending': 'PENDING',
            ':reserved': 'SEATS_RESERVED',
          },
        }),
      );

      await notifyWs(connectionId, {
        bookingReferenceId,
        status: 'FAILED_PAYMENT_TIMEOUT',
        success: false,
      });
    } catch (err: any) {
      // If this fails, that means booking either succeeded or already failed for different reason
      // Do nothing
      if (err.name !== 'ConditionalCheckFailedException') {
        throw err;
      }
    }
  }
};
