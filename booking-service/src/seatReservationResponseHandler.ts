import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

/**
 * Receives message from seat reservation service and writes results to DDB
 */
export const handler = async (event: any) => {
  for (const record of event.Records) {
    const { bookingReferenceId, success, reservationId } = JSON.parse(record.body);
    const newStatus = success ? 'SEATS_RESERVED' : 'FAILED_SEATS_UNAVAILABLE';

    try {
      let updateExpr = 'SET #st = :status, success = :success';
      const attrVals: any = { ':status': newStatus, ':success': success, ':pending': 'PENDING' };

      if (success) {
        updateExpr += ', reservationId = :resId';
        attrVals[':resId'] = reservationId;
      }

      await ddb.send(
        new UpdateCommand({
          TableName: process.env.TABLE_NAME,
          Key: { bookingReferenceId },
          UpdateExpression: updateExpr,
          ConditionExpression: '#st = :pending',
          ExpressionAttributeNames: { '#st': 'status' },
          ExpressionAttributeValues: attrVals,
        }),
      );
    } catch (err: any) {
      // Timeout or other error already kicked in, ignore
      if (err.name !== 'ConditionalCheckFailedException') throw err;
    }
  }
};
