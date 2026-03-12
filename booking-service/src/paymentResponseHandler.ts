import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const lambda = new LambdaClient({});
const wsEndpoint = { endpoint: process.env.WS_API_ENDPOINT };
if (!wsEndpoint) {
  throw new Error('WS_API_ENDPOINT environment variable is missing');
}

export const handler = async (event: any) => {
  for (const record of event.Records) {
    const { bookingReferenceId, paymentConfirmationId } = JSON.parse(record.body);
    console.log(`Received Booking Reference ID: ${bookingReferenceId}`);

    // Check if task is still RUNNING
    console.log('Loading DB entry');
    const { Item } = await ddb.send(
      new GetCommand({
        TableName: process.env.TABLE_NAME,
        Key: { bookingReferenceId },
      }),
    );

    if (!Item || Item.status !== 'RUNNING') continue; // Handled by timeout or already done

    let status = 'COMPLETED';
    let success = true;
    let ticketId: string | undefined;

    // Call the Ticket Gen Service (sync)
    console.log('Calling ticket gen service');
    const ticketResponse = await lambda.send(
      new InvokeCommand({
        FunctionName: process.env.TICKET_GEN_FN,
        Payload: JSON.stringify({
          simulateBookingFailure: Item.simulateBookingFailure,
          reservationId: Item.reservationId,
        }),
      }),
    );

    if (ticketResponse.FunctionError) {
      console.warn('Ticket gen service failed');
      status = 'FAILED_TICKET_ERROR';
      success = false;
    } else {
      const ticketPayload = JSON.parse(Buffer.from(ticketResponse.Payload!).toString());
      ticketId = ticketPayload.ticketId;
    }

    // Save Final State
    console.log('Storing DB entry');
    const finalPayload = {
      bookingReferenceId,
      status,
      success,
      reservationId: Item.reservationId,
      paymentConfirmationId,
      ticketId,
    };

    await ddb.send(
      new PutCommand({
        TableName: process.env.TABLE_NAME,
        Item: { ...Item, ...finalPayload },
      }),
    );

    // Notify WS
    console.log('Sending result to WS');
    const apiClient = new ApiGatewayManagementApiClient(wsEndpoint);
    try {
      await apiClient.send(
        new PostToConnectionCommand({
          ConnectionId: Item.connectionId,
          Data: JSON.stringify(finalPayload),
        }),
      );
    } catch (err: any) {
      console.warn(`WS Disconnected: ${Item.connectionId}`);
      console.error(`Full error for record ${record.messageId}:`, {
        errorMessage: err.message,
        errorStack: err.stack,
        recordBody: record.body,
      });
    }
  }
};
