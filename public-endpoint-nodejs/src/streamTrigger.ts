import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
const sfnClient = new SFNClient({});

export const handler = async (event: any) => {
  // Is run whenever the database is updated, to guarantee that a step functions machine will start
  // If the start is requested in the public endpoint, there might be cases where the machine failed
  // to start only after the database was already written
  // => causing ghost records
  for (const record of event.Records) {
    // Only trigger on new records (INSERT)
    if (record.eventName === 'INSERT') {
      const newItem = record.dynamodb.NewImage;
      const bookingReferenceId = newItem.bookingReferenceId.S;
      const simulateBookingFailure = newItem.simulateBookingFailure.S;

      await sfnClient.send(
        new StartExecutionCommand({
          stateMachineArn: process.env.STATE_MACHINE_ARN,
          input: JSON.stringify({ bookingReferenceId, simulateBookingFailure }),
        }),
      );
    }
  }
};
