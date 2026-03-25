package ProyectoAngularJava.example.demo.controller;

import ProyectoAngularJava.example.demo.model.Room;
import ProyectoAngularJava.example.demo.repository.RoomRepository;
import org.springframework.web.bind.annotation.*;
import java.util.Optional;

@RestController
@RequestMapping("/api/rooms")
@CrossOrigin(origins = "*")
public class RoomController {

    private final RoomRepository roomRepository;

    public RoomController(RoomRepository roomRepository) {
        this.roomRepository = roomRepository;
    }

    @PostMapping
    public Room createRoom(@RequestBody Room room) {
        try {
            System.out.println("Attempting to create room: " + room.getName() + " with code: " + room.getCode());
            return roomRepository.save(room);
        } catch (Exception e) {
            System.err.println("CRITICAL ERROR: Failed to create room in database!");
            e.printStackTrace();
            throw e;
        }
    }

    @GetMapping("/{code}")
    public Optional<Room> getRoomByCode(@PathVariable String code) {
        return roomRepository.findByCode(code);
    }
}
