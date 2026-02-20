import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { v4 as uuidv4 } from "uuid";

const sqsClient = new SQSClient({});
const QUEUE_URL = process.env.PAYMENT_RESPONSE_QUEUE_URL;

export const handler = async (event: any) => {
  for (const record of event.Records) {
    const paymentConfirmationId = uuidv4();
    // Logic here...
    await sqsClient.send(new SendMessageCommand({
      QueueUrl: QUEUE_URL,
      MessageBody: JSON.stringify({ paymentConfirmationId })
    }));
  }
};