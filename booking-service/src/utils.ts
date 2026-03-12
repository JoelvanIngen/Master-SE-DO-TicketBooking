import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';

const wsEndpoint = { endpoint: process.env.WS_API_ENDPOINT };

export async function notifyWs(connectionId: string, payload: any) {
  const apiClient = new ApiGatewayManagementApiClient(wsEndpoint);
  try {
    await apiClient.send(
      new PostToConnectionCommand({ ConnectionId: connectionId, Data: JSON.stringify(payload) }),
    );
  } catch {
    console.warn(`WS Disconnected: ${connectionId}`);
  }
}
