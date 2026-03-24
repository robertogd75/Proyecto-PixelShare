package ProyectoAngularJava.example.demo.repository;

import ProyectoAngularJava.example.demo.model.Room;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface RoomRepository extends JpaRepository<Room, Long> {
    Optional<Room> findByCode(String code);
}
