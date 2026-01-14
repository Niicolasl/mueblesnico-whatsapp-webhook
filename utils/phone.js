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

    // Quitar todo lo que no sea dígito
    let p = phone.toString().replace(/\D/g, "");

    // Si tiene 10 dígitos → agregar 57
    if (p.length === 10) return `57${p}`;

    // Si tiene 11 dígitos y empieza con 0 → quitar 0 y agregar 57
    if (p.length === 11 && p.startsWith("0")) return `57${p.slice(1)}`;

    // Si tiene 12 dígitos y empieza con 57 → ok
    if (p.length === 12 && p.startsWith("57")) return p;

    // fallback (no debería pasar)
    return p;
};
