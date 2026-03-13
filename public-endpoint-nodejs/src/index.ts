import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);
const TABLE_NAME = process.env.TABLE_NAME;

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const method = event.requestContext.http.method;
  const path = event.requestContext.http.path;

  try {
    if (method === 'GET' && path.startsWith('/ticket/')) {
      const bookingReferenceId = event.pathParameters?.bookingReferenceId || path.split('/')[2];

      // Ensure booking reference id is provided
      if (!bookingReferenceId) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Missing bookingReferenceId parameter' }),
        };
      }

      // Request status
      const { Item } = await docClient.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: { bookingReferenceId },
        }),
      );

      // Ensure if booking reference id exists in DB
      if (!Item) {
        return {
          statusCode: 404,
          body: JSON.stringify({ error: 'Booking Reference Not Found' }),
        };
      }

      // Return results
      // We will probably want to reshape a bit to only return useful data but this will do for now
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
        body: JSON.stringify(Item),
      };
    }

    return {
      statusCode: 404,
      body: JSON.stringify({ error: 'Route Not Found' }),
    };
  } catch (error: any) {
    console.error('Error handling request:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
