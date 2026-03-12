import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

/**
 * Receives message from ticket service and writes results to DDB
 */
export const handler = async (event: any) => {
  for (const record of event.Records) {
    const { bookingReferenceId, success, ticketId } = JSON.parse(record.body);
    const newStatus = success ? 'COMPLETED' : 'FAILED_TICKET_ERROR';

    try {
      let updateExpr = 'SET #st = :status, success = :success';
      const attrVals: any = {
        ':status': newStatus,
        ':success': success,
        ':payCompleted': 'PAYMENT_COMPLETED',
      };

      if (success) {
        updateExpr += ', ticketId = :tId';
        attrVals[':tId'] = ticketId;
      }

      await ddb.send(
        new UpdateCommand({
          TableName: process.env.TABLE_NAME,
          Key: { bookingReferenceId },
          UpdateExpression: updateExpr,
          ConditionExpression: '#st = :payCompleted',
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
