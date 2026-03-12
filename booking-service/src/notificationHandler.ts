import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';

const wsEndpoint = { endpoint: process.env.WS_API_ENDPOINT };
const apiClient = new ApiGatewayManagementApiClient(wsEndpoint);

/**
 * Receives message from router to send status update to client over WS
 */
export const handler = async (event: any) => {
  for (const record of event.Records) {
    const { connectionId, payload } = JSON.parse(record.body);
    try {
      await apiClient.send(
        new PostToConnectionCommand({
          ConnectionId: connectionId,
          Data: JSON.stringify(payload),
        }),
      );
    } catch {
      console.warn(`WS Disconnected or failed: ${connectionId}`);
    }
  }
};
