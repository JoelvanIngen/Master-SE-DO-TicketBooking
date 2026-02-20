import { v4 as uuidv4 } from "uuid";

export const handler = async (event: any) => {
  const ticketId = uuidv4();
  return {
    statusCode: 200,
    body: JSON.stringify({ ticketId }),
  };
};