# PIXELSHARE | ESTADO DEL PROYECTO

Pizarra operativa con sistema de coordenadas corregido (2828x2000).
WebSocket sincronizado mediante raw handlers (no STOMP).
Despliegue mediante Docker Compose (network_mode: host).

## Ajustes realizados:
- Eliminación de transform: scale() en CSS.
- Uso de ratio-based mapping en JS.
- Solucionado bug de capa opaca que impedía ver el dibujo.
- Restaurada la sincronización por ID de sala (roomId).
