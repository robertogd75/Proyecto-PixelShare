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
    
    // Map of roomId -> Set of sessions in that room
    private final Map<Long, Set<WebSocketSession>> roomSessions = new ConcurrentHashMap<>();
    
    // Global lock for session management if needed, but we mostly use ConcurrentHashMaps
    private final Set<WebSocketSession> allSessions = Collections.synchronizedSet(new HashSet<>());
    
    private final Map<String, Long> sessionRoomId = new ConcurrentHashMap<>();
    private final Map<Long, Integer> roomParticipants = new ConcurrentHashMap<>();
    private final Map<Long, Long> emptyRoomsSince = new ConcurrentHashMap<>();
    
    // Map of roomId -> sessionId of the host (first one to join)
    private final Map<Long, String> roomHostSessionId = new ConcurrentHashMap<>();

    private final Map<Long, Boolean> roomAllowAllDraw = new ConcurrentHashMap<>();
    private final Map<Long, Boolean> roomAllowAllClear = new ConcurrentHashMap<>();

    public PixelWebSocketHandler(PixelRepository pixelRepository, RoomRepository roomRepository) {
        this.pixelRepository = pixelRepository;
        this.roomRepository = roomRepository;
    }

    @Override
    public void afterConnectionEstablished(@org.springframework.lang.NonNull WebSocketSession session) throws Exception {
        allSessions.add(session);
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
                    if (roomHostSessionId.putIfAbsent(roomId, session.getId()) == null) {
                        // If this session just became host, load initial settings from DB if not already in memory
                        roomRepository.findById(roomId).ifPresent(room -> {
                            roomAllowAllDraw.putIfAbsent(roomId, room.isAllowAllDraw());
                            roomAllowAllClear.putIfAbsent(roomId, room.isAllowAllClear());
                        });
                    }
                    
                    // Room is active, remove from cleanup list
                    emptyRoomsSince.remove(roomId);
                    System.out.println("Session " + session.getId() + " joined room " + roomId + 
                                     (session.getId().equals(roomHostSessionId.get(roomId)) ? " (HOST)" : ""));
                    
                    // Send current settings to the new joiner
                    Pixel settingsMsg = new Pixel();
                    settingsMsg.setType("SETTINGS_UPDATE");
                    settingsMsg.setRoomId(roomId);
                    settingsMsg.setAllowAllDraw(roomAllowAllDraw.getOrDefault(roomId, true));
                    settingsMsg.setAllowAllClear(roomAllowAllClear.getOrDefault(roomId, true));
                    session.sendMessage(new TextMessage(objectMapper.writeValueAsString(settingsMsg)));

                    // 1. Add to room sessions map for optimized broadcasting
                    roomSessions.computeIfAbsent(roomId, k -> Collections.synchronizedSet(new HashSet<>())).add(session);

                    // 2. Initial State Sync: Send existing artwork to the joiner
                    List<Pixel> history = pixelRepository.findByRoomId(roomId);
                    if (!history.isEmpty()) {
                        Pixel initMsg = new Pixel();
                        initMsg.setType("INIT_PIXELS");
                        initMsg.setRoomId(roomId);
                        initMsg.setPixelHistory(history);
                        session.sendMessage(new TextMessage(objectMapper.writeValueAsString(initMsg)));
                    }
                }
            }
        } catch (Exception e) {
            System.err.println("Error tracking session room: " + e.getMessage());
        }
    }

    @Override
    public void afterConnectionClosed(@org.springframework.lang.NonNull WebSocketSession session, @org.springframework.lang.NonNull CloseStatus status) throws Exception {
        allSessions.remove(session);
        String sessionId = session.getId();
        Long roomId = sessionRoomId.remove(sessionId);
        
        if (roomId != null) {
            // Remove from room sessions map
            Set<WebSocketSession> roomSet = roomSessions.get(roomId);
            if (roomSet != null) {
                roomSet.remove(session);
                if (roomSet.isEmpty()) roomSessions.remove(roomId);
            }

            if (roomId > 1) { 
            // Check if this was the host
            // Check if this was the host
            String hostSessionId = roomHostSessionId.get(roomId);
            if (sessionId.equals(hostSessionId)) {
                System.out.println("Host " + sessionId + " disconnected from room " + roomId + ". Room preserved for grace period.");
                roomHostSessionId.remove(roomId);
                // We no longer delete the room immediately or broadcast HOST_CLOSED
                // This allows the host to REFRESH and rejoin as host, and friends to join.
                // The room will be cleaned up by the @Scheduled task if it stays empty for 5 minutes.
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
                        roomAllowAllDraw.remove(roomId);
                        roomAllowAllClear.remove(roomId);
                        it.remove();
                    } catch (Exception e) {
                        System.err.println("Error cleaning up room " + roomId + ": " + e.getMessage());
                    }
                }
            }
        }
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        Pixel pixel = objectMapper.readValue(message.getPayload(), Pixel.class);
        Long roomId = pixel.getRoomId();
        String sessionId = session.getId();
        
        // Check permissions
        boolean isHost = roomId != null && sessionId.equals(roomHostSessionId.get(roomId));
        
        if ("SETTINGS_UPDATE".equals(pixel.getType())) {
            if (isHost && roomId != null) {
                // Update in-memory settings
                roomAllowAllDraw.put(roomId, pixel.isAllowAllDraw());
                roomAllowAllClear.put(roomId, pixel.isAllowAllClear());
                
                // Update in database
                roomRepository.findById(roomId).ifPresent(room -> {
                    room.setAllowAllDraw(pixel.isAllowAllDraw());
                    room.setAllowAllClear(pixel.isAllowAllClear());
                    roomRepository.save(room);
                });
                
                System.out.println("Settings updated for room " + roomId + ": Draw=" + pixel.isAllowAllDraw() + ", Clear=" + pixel.isAllowAllClear());
            } else {
                return; // Ignore setting updates from non-hosts
            }
        } else if ("CLEAR".equals(pixel.getType())) {
            boolean canClear = isHost || (roomId != null && roomAllowAllClear.getOrDefault(roomId, false));
            if (!canClear) return;
        } else if (pixel.getType() == null || "FILL".equals(pixel.getType())) {
            // Drawing pixel or Fill action
            boolean canDraw = roomId == null || isHost || roomAllowAllDraw.getOrDefault(roomId, false);
            if (!canDraw) return;
            
            // Only save to DB if it's not a transient control message
            if (roomId != null) {
                pixelRepository.save(pixel);
            }
        } else if ("TERMINATE_ROOM".equals(pixel.getType())) {
            if (isHost && roomId != null) {
                roomRepository.deleteById(roomId);
                pixel.setType("HOST_CLOSED"); // Morph message to kick everyone else
                System.out.println("Host " + sessionId + " explicitly terminated room " + roomId);
            } else {
                return; // Guest cannot terminate room
            }
        }

        
        String broadcastMessage = objectMapper.writeValueAsString(pixel);
        
        // Optimized Broadcast: Only iterate over sessions in the SAME room
        Set<WebSocketSession> targetSessions = null;
        if (roomId != null) {
            targetSessions = roomSessions.get(roomId);
        } else {
            // Global canvas (roomId == null) still uses the global list
            targetSessions = allSessions;
        }

        if (targetSessions != null) {
            synchronized (targetSessions) {
                for (WebSocketSession s : targetSessions) {
                    if (s.isOpen()) {
                        try {
                            // Don't send back to sender if it's a regular pixel to save bandwidth
                            // (though current frontend expects it for confirmation, we'll keep it for now)
                            s.sendMessage(new TextMessage(broadcastMessage));
                        } catch (Exception e) {
                            // Session likely closed
                        }
                    }
                }
            }
        }
    }
}
