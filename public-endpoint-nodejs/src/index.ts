import { SFNClient, StartExecutionCommand, DescribeExecutionCommand } from "@aws-sdk/client-sfn";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { v4 as uuidv4 } from "uuid";

const sfnClient = new SFNClient({});
const STATE_MACHINE_ARN = process.env.STATE_MACHINE_ARN;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    // ONLY run on /ticket
    // This is hacky, we should extract this logic or use some middleware
    const path = event.rawPath || event.path;
    const method = event.requestContext?.http?.method || event.httpMethod;

    if (method !== "PUT" || (path !== "/ticket")) {
        return {
            statusCode: 404,
            body: JSON.stringify({ error: "Not Found", message: "Not Found" })
        };
    }

    try {
        const simulateBookingFailure = event.queryStringParameters?.simulateBookingFailure;

        // I don't think this is used anywhere in the workflow but we can leave it in for completeness
        const bookingReferenceId = uuidv4();

        const workflowInput = {
            bookingReferenceId,
            simulateBookingFailure: simulateBookingFailure || "none"
        };

        // Start Step Function Execution
        const startCommand = new StartExecutionCommand({
            stateMachineArn: STATE_MACHINE_ARN,
            input: JSON.stringify(workflowInput)
        });
        const { executionArn } = await sfnClient.send(startCommand);

        // Poll for the result (Standard Workflows are async)
        // Poll every 2 seconds for a max of 30 seconds
        for (let i = 0; i < 15; i++) {
            const describeCommand = new DescribeExecutionCommand({ executionArn });
            const status = await sfnClient.send(describeCommand);

            if (status.status === "SUCCEEDED") {
                const output = JSON.parse(status.output || "{}");

                const ticketId = output.ticketInfo?.ticketId || null;

                return {
                    statusCode: 200,
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        bookingReferenceId: bookingReferenceId,
                        reservationId: output.reservationInfo?.reservationId, // From Reserve Seats
                        paymentConfirmationId: output.paymentInfo?.paymentConfirmationId, // From Retrieve Payment
                        ticketId: ticketId, // From Generate Ticket
                        success: !!ticketId
                    })
                };
            } else if (status.status === "FAILED" || status.status === "TIMED_OUT" || status.status === "ABORTED") {
                return {
                    statusCode: 500,
                    body: JSON.stringify({
                        error: "Workflow failed",
                        status: status.status,
                        cause: status.cause,
                        bookingReferenceId
                    })
                };
            }

            // Wait 2 seconds
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        return {
            statusCode: 202,
            body: ""
        };

    } catch (error: any) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};