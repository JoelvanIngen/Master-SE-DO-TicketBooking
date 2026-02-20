export const handler = async (event: any) => {
    console.log("Reserving seats...", event);
    if (event.simulateBookingFailure === "seats") {
      throw new Error("ErrorSeatsNotAvailable");
    }
    return { reservationId: "1234" };
  };