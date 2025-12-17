// Quita +57 y deja solo el número colombiano
export const normalizarTelefono = (phone) => {
    if (!phone) return null;

    let p = phone.toString().replace(/\s|\+/g, "");

    // Si viene con 57 y tiene 12 dígitos → quitarlo
    if (p.startsWith("57") && p.length === 12) {
        p = p.slice(2);
    }

    return p; // SIEMPRE sin 57
};

// Convierte número interno a formato WhatsApp (57XXXXXXXXXX)
export const telefonoParaWhatsApp = (phone) => {
    if (!phone) return null;

    let p = phone.toString().replace(/\s|\+/g, "");

    // Si ya tiene 57 y 12 dígitos → OK
    if (p.startsWith("57") && p.length === 12) {
        return p;
    }

    // Si tiene 10 dígitos → agregar 57
    if (p.length === 10) {
        return `57${p}`;
    }

    // fallback (no debería pasar)
    return p;
};
