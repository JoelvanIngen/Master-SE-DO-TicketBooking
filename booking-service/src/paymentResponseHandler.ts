import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { notifyWs } from './utils';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const lambda = new LambdaClient({});

export const handler = async (event: any) => {
  for (const record of event.Records) {
    const { bookingReferenceId, paymentConfirmationId } = JSON.parse(record.body);

    const { Item } = await ddb.send(
      new GetCommand({ TableName: process.env.TABLE_NAME, Key: { bookingReferenceId } }),
    );

    if (!Item || Item.status !== 'SEATS_RESERVED') continue;

    // Call the Ticket Gen Service (sync)
    const ticketResponse = await lambda.send(
      new InvokeCommand({
        FunctionName: process.env.TICKET_GEN_FN,
        Payload: JSON.stringify({
          simulateBookingFailure: Item.simulateBookingFailure,
          reservationId: Item.reservationId,
        }),
      }),
    );

    const isError = !!ticketResponse.FunctionError;
    const status = isError ? 'FAILED_TICKET_ERROR' : 'COMPLETED';
    let ticketId;

    if (!isError) {
      ticketId = JSON.parse(Buffer.from(ticketResponse.Payload!).toString()).ticketId;
    }

    const payload = {
      bookingReferenceId,
      status,
      success: !isError,
      reservationId: Item.reservationId,
      paymentConfirmationId,
      ticketId,
    };

    // Update DDB
    try {
      let updateExpr = 'SET #st = :st, success = :suc, paymentConfirmationId = :payId';
      const attrVals: any = {
        ':st': status,
        ':suc': !isError,
        ':payId': paymentConfirmationId,
        ':reserved': 'SEATS_RESERVED',
      };

      if (ticketId) {
        updateExpr += ', ticketId = :tId';
        attrVals[':tId'] = ticketId;
      }

      await ddb.send(
        new UpdateCommand({
          TableName: process.env.TABLE_NAME,
          Key: { bookingReferenceId },
          UpdateExpression: updateExpr,
          ConditionExpression: '#st = :reserved',
          ExpressionAttributeNames: { '#st': 'status' },
          ExpressionAttributeValues: attrVals,
        }),
      );

      await notifyWs(Item.connectionId, payload);
    } catch (err: any) {
      if (err.name !== 'ConditionalCheckFailedException') throw err;
    }
  }
};
