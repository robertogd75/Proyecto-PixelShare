package ProyectoAngularJava.example.demo.config;

import ProyectoAngularJava.example.demo.handler.PixelWebSocketHandler;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {

    private final PixelWebSocketHandler pixelWebSocketHandler;

    public WebSocketConfig(PixelWebSocketHandler pixelWebSocketHandler) {
        this.pixelWebSocketHandler = pixelWebSocketHandler;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(pixelWebSocketHandler, "/ws-pixels")
                .setAllowedOrigins("*");
    }
}
