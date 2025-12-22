export function formatearFecha(fecha) {
    if (!fecha) return "";

    const date = new Date(fecha);

    return date.toLocaleDateString("es-CO", {
        weekday: "long", // quítalo si no quieres "Lunes"
        day: "2-digit",
        month: "long",
        year: "numeric"
    });
}
