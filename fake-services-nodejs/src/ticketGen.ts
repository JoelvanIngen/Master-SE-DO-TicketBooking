import { v4 as uuidv4 } from 'uuid';

export const handler = async (event: any) => {
  console.log('Received event:', event);
  if (event.simulateBookingFailure === 'ticket') {
    throw new Error('Ticket generation failed');
  }
  const ticketId = uuidv4();
  return { ticketId };
};
