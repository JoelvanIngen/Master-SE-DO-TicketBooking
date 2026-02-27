import { v4 as uuidv4 } from "uuid";

export const handler = async (event: any) => {
  console.log("Received event:", event);
  const ticketId = uuidv4();
  return { ticketId };
};