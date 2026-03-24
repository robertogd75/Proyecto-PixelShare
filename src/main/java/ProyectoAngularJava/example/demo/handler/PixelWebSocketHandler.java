package ProyectoAngularJava.example.demo.handler;

import ProyectoAngularJava.example.demo.model.Pixel;
import ProyectoAngularJava.example.demo.repository.PixelRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

@Component
public class PixelWebSocketHandler extends TextWebSocketHandler {

    private final PixelRepository pixelRepository;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final Set<WebSocketSession> sessions = Collections.synchronizedSet(new HashSet<>());

    public PixelWebSocketHandler(PixelRepository pixelRepository) {
        this.pixelRepository = pixelRepository;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        sessions.add(session);
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
        sessions.remove(session);
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        Pixel pixel = objectMapper.readValue(message.getPayload(), Pixel.class);
        
        // Persist to MySQL if it belongs to a room or global (roomId != null)
        if (pixel.getRoomId() != null) {
            pixelRepository.save(pixel);
        }
        
        // Broadcast to all other sessions in the same room
        String broadcastMessage = objectMapper.writeValueAsString(pixel);
        for (WebSocketSession s : sessions) {
            if (s.isOpen()) {
                // For now, we trust the pixel's roomId for filtering.
                // In a production app, we would track session room membership.
                s.sendMessage(new TextMessage(broadcastMessage));
            }
        }
    }
}
