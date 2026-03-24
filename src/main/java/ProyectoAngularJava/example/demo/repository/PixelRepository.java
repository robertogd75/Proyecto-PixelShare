package ProyectoAngularJava.example.demo.repository;

import ProyectoAngularJava.example.demo.model.Pixel;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface PixelRepository extends JpaRepository<Pixel, Long> {
}
