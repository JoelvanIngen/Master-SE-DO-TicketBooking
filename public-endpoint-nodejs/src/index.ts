import { SFNClient, StartExecutionCommand, DescribeExecutionCommand } from "@aws-sdk/client-sfn";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";

const sfnClient = new SFNClient({});
const STATE_MACHINE_ARN = process.env.STATE_MACHINE_ARN;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        const body = event.body ? JSON.parse(event.body) : {};

        // Start Step Function Execution
        const startCommand = new StartExecutionCommand({
            stateMachineArn: STATE_MACHINE_ARN,
            input: JSON.stringify(body)
        });
        const { executionArn } = await sfnClient.send(startCommand);

        // Poll for the result (Standard Workflows are async)
        // Poll every 2 seconds for a max of 30 seconds
        for (let i = 0; i < 15; i++) {
            const describeCommand = new DescribeExecutionCommand({ executionArn });
            const status = await sfnClient.send(describeCommand);

            if (status.status === "SUCCEEDED") {
                return {
                    statusCode: 200,
                    headers: { "Content-Type": "application/json" },
                    body: status.output
                };
            } else if (status.status === "FAILED" || status.status === "TIMED_OUT" || status.status === "ABORTED") {
                return {
                    statusCode: 500,
                    body: JSON.stringify({ error: "Workflow failed", status: status.status, cause: status.cause })
                };
            }

            // Wait 2 seconds
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        return {
            statusCode: 202,
            body: JSON.stringify({ message: "Task still processing", executionArn })
        };

    } catch (error: any) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};