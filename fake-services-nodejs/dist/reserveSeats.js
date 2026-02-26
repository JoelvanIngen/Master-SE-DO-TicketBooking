// src/reserveSeats.ts
var handler = async (event) => {
  console.log("Reserving seats...", event);
  if (event.simulateBookingFailure === "seats") {
    throw new Error("ErrorSeatsNotAvailable");
  }
  return { reservationId: "1234" };
};
export {
  handler
};
