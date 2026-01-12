import { pool } from "./init.js";

export async function getOrCreateClient(phone, name) {
    const { rows } = await pool.query(
        "SELECT id, name FROM clients WHERE phone = $1",
        [phone]
    );

    // No existe → crear
    if (rows.length === 0) {
        const insert = await pool.query(
            `INSERT INTO clients (phone, name)
       VALUES ($1, $2)
       RETURNING id, name`,
            [phone, name]
        );

        return insert.rows[0];
    }

    const client = rows[0];

    // Existe pero no tiene nombre → actualizar
    if (!client.name && name) {
        await pool.query(
            "UPDATE clients SET name = $1, updated_at = NOW() WHERE phone = $2",
            [name, phone]
        );
        client.name = name;
    }

    return client;
}
