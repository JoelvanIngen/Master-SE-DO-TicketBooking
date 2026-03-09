import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';

const sfnClient = new SFNClient({});
const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);

const STATE_MACHINE_ARN = process.env.STATE_MACHINE_ARN;
const TABLE_NAME = process.env.TABLE_NAME;

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const method = event.requestContext.http.method;
  const path = event.requestContext.http.path;

  try {
    // PUT: Return 202 Accepted and process in background
    if (method === 'PUT' && path === '/ticket') {
      const simulateBookingFailure = event.queryStringParameters?.simulateBookingFailure || 'none';
      const bookingReferenceId = uuidv4();

      // Save initial status to DDB
      await docClient.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            bookingReferenceId,
            status: 'PENDING',
            simulateBookingFailure,
          },
        }),
      );

      // Start Step Function
      const workflowInput = {
        bookingReferenceId,
        simulateBookingFailure,
      };

      await sfnClient.send(
        new StartExecutionCommand({
          stateMachineArn: STATE_MACHINE_ARN,
          input: JSON.stringify(workflowInput),
        }),
      );

      // 3. Return 202 Accepted allowing client to start polling
      return {
        statusCode: 202,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingReferenceId }),
      };
    }

    // GET: Get status and return 200 OK with status
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
        headers: { 'Content-Type': 'application/json' },
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
