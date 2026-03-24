package ProyectoAngularJava.example.demo.controller;

import ProyectoAngularJava.example.demo.model.Pixel;
import ProyectoAngularJava.example.demo.repository.PixelRepository;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/pixels")
@CrossOrigin(origins = "*")
public class PixelController {

    private final PixelRepository repository;

    public PixelController(PixelRepository repository) {
        this.repository = repository;
    }

    @GetMapping
    public List<Pixel> getPixels() {
        return repository.findAll();
    }

    @PostMapping
    public Pixel savePixel(@RequestBody Pixel pixel) {
        return repository.save(pixel);
    }
}
