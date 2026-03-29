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
import java.util.List;
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

    // Global lock for session management if needed, but we mostly use
    // ConcurrentHashMaps
    private final Set<WebSocketSession> allSessions = Collections.synchronizedSet(new HashSet<>());

    private final Map<String, Long> sessionRoomId = new ConcurrentHashMap<>();
    private final Map<Long, Integer> roomParticipants = new ConcurrentHashMap<>();
    private final Map<Long, Long> emptyRoomsSince = new ConcurrentHashMap<>();

    // Map of roomId -> sessionId of the host (first one to join)
    private final Map<Long, String> roomHostSessionId = new ConcurrentHashMap<>();

    private final Map<Long, Boolean> roomAllowAllDraw = new ConcurrentHashMap<>();
    private final Map<Long, Boolean> roomAllowAllClear = new ConcurrentHashMap<>();

    // Queue for high-performance batched persistence
    private final java.util.concurrent.ConcurrentLinkedQueue<Pixel> pixelSaveQueue = new java.util.concurrent.ConcurrentLinkedQueue<>();

    public PixelWebSocketHandler(PixelRepository pixelRepository, RoomRepository roomRepository) {
        this.pixelRepository = pixelRepository;
        this.roomRepository = roomRepository;
    }

    @Override
    public void afterConnectionEstablished(@org.springframework.lang.NonNull WebSocketSession session)
            throws Exception {
        allSessions.add(session);
        try {
            URI uri = session.getUri();
            String query = uri != null ? uri.getQuery() : null;
            if (query != null) {
                MultiValueMap<String, String> params = UriComponentsBuilder.fromUriString("?" + query).build()
                        .getQueryParams();
                String roomIdStr = params.getFirst("roomId");
                if (roomIdStr != null && !roomIdStr.equals("undefined") && !roomIdStr.isEmpty()) {
                    Long roomId = Long.parseLong(roomIdStr);
                    sessionRoomId.put(session.getId(), roomId);

                    // Update participants count
                    roomParticipants.merge(roomId, 1, (oldV, newV) -> oldV + newV);

                    // Assign host if none exists for this room
                    if (roomHostSessionId.putIfAbsent(roomId, session.getId()) == null) {
                        // If this session just became host, load initial settings from DB if not
                        // already in memory
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
                    roomSessions.computeIfAbsent(roomId, k -> Collections.synchronizedSet(new HashSet<>()))
                            .add(session);

                    // 2. Initial State Sync: Send existing artwork to the joiner in chunks to avoid
                    // large message limits
                    List<Pixel> history = pixelRepository.findByRoomId(roomId);
                    if (!history.isEmpty()) {
                        int chunkSize = 1000;
                        for (int i = 0; i < history.size(); i += chunkSize) {
                            int end = Math.min(i + chunkSize, history.size());
                            List<Pixel> chunk = history.subList(i, end);

                            Pixel initMsg = new Pixel();
                            initMsg.setType("INIT_PIXELS");
                            initMsg.setRoomId(roomId);
                            initMsg.setPixelHistory(chunk);
                            session.sendMessage(new TextMessage(objectMapper.writeValueAsString(initMsg)));
                        }
                    }
                }
            }
        } catch (Exception e) {
            System.err.println("Error tracking session room: " + e.getMessage());
        }
    }

    @Override
    public void afterConnectionClosed(@org.springframework.lang.NonNull WebSocketSession session,
            @org.springframework.lang.NonNull CloseStatus status) throws Exception {
        allSessions.remove(session);
        String sessionId = session.getId();
        Long roomId = sessionRoomId.remove(sessionId);

        if (roomId != null) {
            // Remove from room sessions map
            Set<WebSocketSession> roomSet = roomSessions.get(roomId);
            if (roomSet != null) {
                roomSet.remove(session);
                if (roomSet.isEmpty())
                    roomSessions.remove(roomId);
            }

            if (roomId > 1) {
                String hostSessionId = roomHostSessionId.get(roomId);
                if (sessionId.equals(hostSessionId)) {
                    roomHostSessionId.remove(roomId);
                    // Pass host to next available session
                    Set<WebSocketSession> roomSessionsSet = roomSessions.get(roomId);
                    if (roomSessionsSet != null && !roomSessionsSet.isEmpty()) {
                        WebSocketSession nextHost = roomSessionsSet.iterator().next();
                        roomHostSessionId.put(roomId, nextHost.getId());
                        System.out.println("Host handover: Session " + nextHost.getId() + " is now host of room " + roomId);
                    } else {
                        System.out.println("Host " + sessionId + " disconnected from room " + roomId
                                + ". Room is now empty.");
                    }
                } else {
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

    /**
     * Overdrive Architecture: Batched Persistence Task
     * Drains the queue and saves pixels in bulk every second.
     */
    @Scheduled(fixedDelay = 1000)
    public void batchSavePixels() {
        if (pixelSaveQueue.isEmpty())
            return;

        List<Pixel> batch = new java.util.ArrayList<>();
        Pixel p;
        while ((p = pixelSaveQueue.poll()) != null) {
            batch.add(p);
            if (batch.size() >= 2000)
                break; // Don't make the batch TOO large
        }

        if (!batch.isEmpty()) {
            try {
                pixelRepository.saveAll(batch);
                // System.out.println("Overdrive: Saved batch of " + batch.size() + " pixels.");
            } catch (Exception e) {
                System.err.println("Error in batch save: " + e.getMessage());
            }
        }
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        String payload = message.getPayload();

        // Overdrive Architecture: Handle both single objects and arrays
        if (payload.startsWith("[")) {
            List<Pixel> pixels = objectMapper.readValue(payload,
                    new com.fasterxml.jackson.core.type.TypeReference<List<Pixel>>() {
                    });
            if (pixels != null && !pixels.isEmpty()) {
                // Determine roomId from first pixel
                Long roomId = pixels.get(0).getRoomId();
                if (canDrawBatch(session.getId(), roomId)) {
                    // 1. Broadcast IMMEDIATELY for 0-latency feel
                    broadcastToRoom(roomId, message);

                    // 2. Queue for async persistence
                    if (roomId != null) {
                        pixelSaveQueue.addAll(pixels);
                    }
                }
            }
        } else {
            Pixel pixel = objectMapper.readValue(payload, Pixel.class);
            processSinglePixel(session, pixel, message);
        }
    }

    private boolean canDrawBatch(String sessionId, Long roomId) {
        boolean isHost = roomId != null && sessionId.equals(roomHostSessionId.get(roomId));
        boolean allowed = roomId == null || isHost || roomAllowAllDraw.getOrDefault(roomId, true);
        if (!allowed) {
            System.out.println("Rejected draw from session " + sessionId + " in room " + roomId + " (Permissions restricted)");
        }
        return allowed;
    }

    private void processSinglePixel(WebSocketSession session, Pixel pixel, TextMessage originalMessage)
            throws Exception {
        Long roomId = pixel.getRoomId();
        String sessionId = session.getId();
        boolean isHost = roomId != null && sessionId.equals(roomHostSessionId.get(roomId));

        if ("SETTINGS_UPDATE".equals(pixel.getType())) {
            if (isHost && roomId != null) {
                roomAllowAllDraw.put(roomId, pixel.isAllowAllDraw());
                roomAllowAllClear.put(roomId, pixel.isAllowAllClear());
                roomRepository.findById(roomId).ifPresent(room -> {
                    room.setAllowAllDraw(pixel.isAllowAllDraw());
                    room.setAllowAllClear(pixel.isAllowAllClear());
                    roomRepository.save(room);
                });
                broadcastToRoom(roomId, originalMessage);
            }
        } else if ("CLEAR".equals(pixel.getType())) {
            boolean canClear = isHost || (roomId != null && roomAllowAllClear.getOrDefault(roomId, true));
            if (canClear) {
                broadcastToRoom(roomId, originalMessage);
            }
        } else if (pixel.getType() == null || "FILL".equals(pixel.getType())) {
            if (canDrawBatch(sessionId, roomId)) {
                broadcastToRoom(roomId, originalMessage);
                if (roomId != null) {
                    pixelSaveQueue.add(pixel);
                }
            }
        } else if ("TERMINATE_ROOM".equals(pixel.getType())) {
            if (isHost && roomId != null) {
                roomRepository.deleteById(roomId);
                pixel.setType("HOST_CLOSED");
                broadcastToRoom(roomId, new TextMessage(objectMapper.writeValueAsString(pixel)));
            }
        } else {
            // Forward other messages (RESIZE, etc.)
            broadcastToRoom(roomId, originalMessage);
        }
    }

    private void broadcastToRoom(Long roomId, TextMessage message) {
        Set<WebSocketSession> targetSessions = (roomId != null) ? roomSessions.get(roomId) : allSessions;
        if (targetSessions != null) {
            synchronized (targetSessions) {
                for (WebSocketSession s : targetSessions) {
                    if (s.isOpen()) {
                        try {
                            s.sendMessage(message);
                        } catch (Exception e) {
                        }
                    }
                }
            }
        }
    }
}
