package ProyectoAngularJava.example.demo.controller;

import ProyectoAngularJava.example.demo.model.Room;
import ProyectoAngularJava.example.demo.repository.RoomRepository;
import org.springframework.web.bind.annotation.*;
import java.util.Optional;

@RestController
@RequestMapping("/api/rooms")
public class RoomController {

    private final RoomRepository roomRepository;

    public RoomController(RoomRepository roomRepository) {
        this.roomRepository = roomRepository;
    }

    @PostMapping
    public Room createRoom(@RequestBody Room room) {
        return roomRepository.save(room);
    }

    @GetMapping("/{code}")
    public Optional<Room> getRoomByCode(@PathVariable String code) {
        return roomRepository.findByCode(code);
    }
}
