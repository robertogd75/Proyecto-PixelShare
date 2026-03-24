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
import org.springframework.scheduling.annotation.Scheduled;

import java.util.Collections;
import java.util.HashSet;
import java.util.Set;
import java.util.Map;
import java.util.Iterator;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.net.URI;

@Component
public class PixelWebSocketHandler extends TextWebSocketHandler {

    private final PixelRepository pixelRepository;
    private final RoomRepository roomRepository;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final Set<WebSocketSession> sessions = Collections.synchronizedSet(new HashSet<>());
    
    private final Map<String, Long> sessionRoomId = new ConcurrentHashMap<>();
    private final Map<Long, Integer> roomParticipants = new ConcurrentHashMap<>();
    private final Map<Long, Long> emptyRoomsSince = new ConcurrentHashMap<>();
    
    // Map of roomId -> sessionId of the host (first one to join)
    private final Map<Long, String> roomHostSessionId = new ConcurrentHashMap<>();

    public PixelWebSocketHandler(PixelRepository pixelRepository, RoomRepository roomRepository) {
        this.pixelRepository = pixelRepository;
        this.roomRepository = roomRepository;
    }

    @Override
    public void afterConnectionEstablished(@org.springframework.lang.NonNull WebSocketSession session) throws Exception {
        sessions.add(session);
        try {
            URI uri = session.getUri();
            String query = uri != null ? uri.getQuery() : null;
            if (query != null) {
                MultiValueMap<String, String> params = UriComponentsBuilder.fromUriString("?" + query).build().getQueryParams();
                String roomIdStr = params.getFirst("roomId");
                if (roomIdStr != null && !roomIdStr.equals("undefined") && !roomIdStr.isEmpty()) {
                    Long roomId = Long.parseLong(roomIdStr);
                    sessionRoomId.put(session.getId(), roomId);
                    
                    // Update participants count
                    roomParticipants.merge(roomId, 1, (oldV, newV) -> oldV + newV);
                    
                    // Assign host if none exists for this room
                    roomHostSessionId.putIfAbsent(roomId, session.getId());
                    
                    // Room is active, remove from cleanup list
                    emptyRoomsSince.remove(roomId);
                    System.out.println("Session " + session.getId() + " joined room " + roomId + 
                                     (session.getId().equals(roomHostSessionId.get(roomId)) ? " (HOST)" : ""));
                }
            }
        } catch (Exception e) {
            System.err.println("Error tracking session room: " + e.getMessage());
        }
    }

    @Override
    public void afterConnectionClosed(@org.springframework.lang.NonNull WebSocketSession session, @org.springframework.lang.NonNull CloseStatus status) throws Exception {
        sessions.remove(session);
        String sessionId = session.getId();
        Long roomId = sessionRoomId.remove(sessionId);
        
        if (roomId != null && roomId > 1) { 
            // Check if this was the host
            String hostSessionId = roomHostSessionId.get(roomId);
            if (sessionId.equals(hostSessionId)) {
                System.out.println("Host left room " + roomId + ". Closing room for everyone.");
                roomHostSessionId.remove(roomId);
                roomParticipants.remove(roomId);
                emptyRoomsSince.remove(roomId);
                
                // Broadcast "HOST_CLOSED" to remaining sessions in this room
                Pixel closeMsg = new Pixel();
                closeMsg.setType("HOST_CLOSED");
                closeMsg.setRoomId(roomId);
                String msgJson = objectMapper.writeValueAsString(closeMsg);
                
                synchronized (sessions) {
                    for (WebSocketSession s : sessions) {
                        Long sRoomId = sessionRoomId.get(s.getId());
                        if (roomId.equals(sRoomId) && s.isOpen() && msgJson != null) {
                            s.sendMessage(new TextMessage(msgJson));
                        }
                    }
                }
                
                // Delete room from database immediately
                try {
                    roomRepository.deleteById(roomId);
                } catch (Exception e) {
                    System.err.println("Error deleting room on host exit: " + e.getMessage());
                }
            } else {
                // Not the host, just decrement participant count
                Integer current = roomParticipants.get(roomId);
                if (current != null) {
                    int newVal = current - 1;
                    if (newVal <= 0) {
                        roomParticipants.remove(roomId);
                        emptyRoomsSince.put(roomId, System.currentTimeMillis());
                        System.out.println("Room " + roomId + " is now empty. Grace period started.");
                    } else {
                        roomParticipants.put(roomId, newVal);
                    }
                }
            }
        }
    }

    @Scheduled(fixedDelay = 60000)
    public void cleanupEmptyRooms() {
        long now = System.currentTimeMillis();
        long gracePeriod = TimeUnit.MINUTES.toMillis(5);
        
        Iterator<Map.Entry<Long, Long>> it = emptyRoomsSince.entrySet().iterator();
        while (it.hasNext()) {
            Map.Entry<Long, Long> entry = it.next();
            Long time = entry.getValue();
            if (time != null && (now - time > gracePeriod)) {
                Long roomId = entry.getKey();
                if (roomId != null) {
                    try {
                        roomRepository.deleteById(roomId);
                        System.out.println("Room " + roomId + " deleted after grace period.");
                        it.remove();
                    } catch (Exception e) {
                        System.err.println("Error cleaning up room " + roomId + ": " + e.getMessage());
                    }
                }
            }
        }
    }

    @Override
    protected void handleTextMessage(@org.springframework.lang.NonNull WebSocketSession session, @org.springframework.lang.NonNull TextMessage message) throws Exception {
        Pixel pixel = objectMapper.readValue(message.getPayload(), Pixel.class);
        
        if (pixel.getRoomId() != null && !"RESIZE".equals(pixel.getType())) {
            pixelRepository.save(pixel);
        }
        
        String broadcastMessage = objectMapper.writeValueAsString(pixel);
        
        synchronized (sessions) {
            for (WebSocketSession s : sessions) {
                if (s.isOpen()) {
                    Long sRoomId = sessionRoomId.get(s.getId());
                    boolean sameRoom = (pixel.getRoomId() == null && sRoomId == null) || 
                                     (pixel.getRoomId() != null && pixel.getRoomId().equals(sRoomId));
                    
                    if (sameRoom) {
                        try {
                            s.sendMessage(new TextMessage(broadcastMessage));
                        } catch (Exception e) {
                            // Session might have closed during broadcast
                        }
                    }
                }
            }
        }
    }
}
