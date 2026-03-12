import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const apiConfig = { endpoint: process.env.WS_API_ENDPOINT };

export const handler = async (event: any) => {
  for (const record of event.Records) {
    const { bookingReferenceId, connectionId, reservationId } = JSON.parse(record.body);

    const { Item } = await ddb.send(
      new GetCommand({
        TableName: process.env.TABLE_NAME,
        Key: { bookingReferenceId },
      }),
    );

    // If still ongoing: cancel
    if (Item && Item.status === 'RUNNING') {
      const payload = {
        bookingReferenceId,
        reservationId,
        status: 'FAILED_PAYMENT_TIMEOUT',
        success: false,
      };

      await ddb.send(
        new PutCommand({ TableName: process.env.TABLE_NAME, Item: { ...Item, ...payload } }),
      );

      const apiClient = new ApiGatewayManagementApiClient(apiConfig);
      try {
        await apiClient.send(
          new PostToConnectionCommand({
            ConnectionId: connectionId,
            Data: JSON.stringify(payload),
          }),
        );
      } catch {}
    }
  }
};
