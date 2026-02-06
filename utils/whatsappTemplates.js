export function crearPlantillaPedidoCreado(order) {
    return {
        messaging_product: "whatsapp",
        type: "template",
        template: {
            name: "pedido_creado",
            language: { code: "es" },
            components: [
                {
                    type: "body",
                    parameters: [
                        {
                            type: "text",
                            text: order.nombre_cliente
                        },
                        {
                            type: "text",
                            text: order.order_code
                        },
                        {
                            type: "text",
                            text: order.descripcion_trabajo
                        },
                        {
                            type: "text",
                            text: Number(order.valor_total).toLocaleString()
                        }
                    ]
                }
            ]
        }
    };
}