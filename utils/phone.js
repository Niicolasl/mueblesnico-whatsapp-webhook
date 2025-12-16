export const normalizarTelefono = (phone) => {
    if (!phone) return null;

    // quitar espacios y +
    let p = phone.toString().replace(/\s|\+/g, "");

    // si empieza por 57 y tiene 12 dígitos → quitarlo
    if (p.startsWith("57") && p.length === 12) {
        p = p.slice(2);
    }

    // devolver SIEMPRE string
    return p;
};
