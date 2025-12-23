export const obtenerSaludoColombia = () => {
  const ahora = new Date();

  // Colombia UTC-5
  const horaColombia = new Date(
    ahora.toLocaleString("en-US", { timeZone: "America/Bogota" })
  ).getHours();

  if (horaColombia >= 5 && horaColombia < 12) {
    return "buenos días";
  }

  if (horaColombia >= 12 && horaColombia < 18) {
    return "buenas tardes";
  }

  return "buenas noches";
};
