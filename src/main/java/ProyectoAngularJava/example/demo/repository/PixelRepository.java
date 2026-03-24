package ProyectoAngularJava.example.demo.repository;

import ProyectoAngularJava.example.demo.model.Pixel;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface PixelRepository extends JpaRepository<Pixel, Long> {
    List<Pixel> findByRoomId(Long roomId);
}
