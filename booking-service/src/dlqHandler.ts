import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

/**
 * Fires certain timeout time after workflow start to clean up zombie workflows
 * If workflow already finished or had different error, this doesn't change state
 */
export const handler = async (event: any) => {
  for (const record of event.Records) {
    const { bookingReferenceId } = JSON.parse(record.body);

    try {
      await ddb.send(
        new UpdateCommand({
          TableName: process.env.TABLE_NAME,
          Key: { bookingReferenceId },
          UpdateExpression: 'SET #st = :failed, success = :suc',
          ConditionExpression: '#st IN (:pending, :reserved, :payCompleted)',
          ExpressionAttributeNames: { '#st': 'status' },
          ExpressionAttributeValues: {
            ':failed': 'FAILED_BOOKING',
            ':suc': false,
            ':pending': 'PENDING',
            ':reserved': 'SEATS_RESERVED',
            ':payCompleted': 'PAYMENT_COMPLETED',
          },
        }),
      );
    } catch (err: any) {
      if (err.name !== 'ConditionalCheckFailedException') throw err;
    }
  }
};
