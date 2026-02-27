export const handler = async (event: any) => {
    console.log("Reserving seats...", event);
    if (event.simulateBookingFailure === "seats") {
        const error = new Error("Seats not available");
        // Make sure the ASL error state matches (gracious failure)
        error.name = "ErrorSeatsNotAvailable";
        throw error;
    }
    return { reservationId: "1234" };
  };