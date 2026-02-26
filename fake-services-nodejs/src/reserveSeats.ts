export const handler = async (event: any) => {
<<<<<<< HEAD
  console.log("Reserving seats...", event);
  if (event.simulateBookingFailure === "seats") {
    throw new Error("ErrorSeatsNotAvailable");
  }
  return { reservationId: "1234" };
};
=======
    console.log("Reserving seats...", event);
    if (event.simulateBookingFailure === "seats") {
      throw new Error("ErrorSeatsNotAvailable");
    }
    return { reservationId: "1234" };
  };
>>>>>>> main
