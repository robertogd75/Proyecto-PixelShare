package ProyectoAngularJava.example.demo.handler;

import ProyectoAngularJava.example.demo.model.Pixel;
import ProyectoAngularJava.example.demo.repository.PixelRepository;
import ProyectoAngularJava.example.demo.repository.RoomRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import org.springframework.util.MultiValueMap;
import org.springframework.web.util.UriComponentsBuilder;

import java.util.Collections;
import java.util.HashSet;
import java.util.Set;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class PixelWebSocketHandler extends TextWebSocketHandler {

    private final PixelRepository pixelRepository;
    private final RoomRepository roomRepository;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final Set<WebSocketSession> sessions = Collections.synchronizedSet(new HashSet<>());
    
    // Track room membership
    private final Map<String, Long> sessionRoomId = new ConcurrentHashMap<>();
    private final Map<Long, Integer> roomParticipants = new ConcurrentHashMap<>();

    public PixelWebSocketHandler(PixelRepository pixelRepository, RoomRepository roomRepository) {
        this.pixelRepository = pixelRepository;
        this.roomRepository = roomRepository;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        sessions.add(session);
        
        // Extract roomId from query params: /ws-pixels?roomId=123
        try {
            String query = session.getUri().getQuery();
            if (query != null) {
                MultiValueMap<String, String> params = UriComponentsBuilder.fromUriString("?" + query).build().getQueryParams();
                String roomIdStr = params.getFirst("roomId");
                if (roomIdStr != null && !roomIdStr.equals("undefined") && !roomIdStr.isEmpty()) {
                    Long roomId = Long.parseLong(roomIdStr);
                    sessionRoomId.put(session.getId(), roomId);
                    roomParticipants.merge(roomId, 1, Integer::sum);
                    System.out.println("Session " + session.getId() + " joined room " + roomId);
                }
            }
        } catch (Exception e) {
            System.err.println("Error tracking session room: " + e.getMessage());
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
        sessions.remove(session);
        Long roomId = sessionRoomId.remove(session.getId());
        
        if (roomId != null && roomId > 0) { // Don't delete global (roomId 0 or 1 usually) or private (null)
            int count = roomParticipants.merge(roomId, -1, Integer::sum);
            System.out.println("Session " + session.getId() + " left room " + roomId + ". Remaining: " + count);
            if (count <= 0) {
                roomParticipants.remove(roomId);
                try {
                    // Logic to delete room if empty
                    roomRepository.deleteById(roomId);
                    System.out.println("Room " + roomId + " deleted because it is empty.");
                } catch (Exception e) {
                    System.err.println("Error deleting empty room: " + e.getMessage());
                }
            }
        }
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        Pixel pixel = objectMapper.readValue(message.getPayload(), Pixel.class);
        
        if (pixel.getRoomId() != null) {
            pixelRepository.save(pixel);
        }
        
        String broadcastMessage = objectMapper.writeValueAsString(pixel);
        
        // Broadcast to all other sessions in the same room
        synchronized (sessions) {
            for (WebSocketSession s : sessions) {
                if (s.isOpen()) {
                    Long sRoomId = sessionRoomId.get(s.getId());
                    // Match rooms (both null for global/private, or matching Long IDs)
                    boolean sameRoom = (pixel.getRoomId() == null && sRoomId == null) || 
                                     (pixel.getRoomId() != null && pixel.getRoomId().equals(sRoomId));
                    
                    if (sameRoom) {
                        try {
                            s.sendMessage(new TextMessage(broadcastMessage));
                        } catch (Exception e) {
                            System.err.println("Error sending message to session " + s.getId());
                        }
                    }
                }
            }
        }
    }
}
