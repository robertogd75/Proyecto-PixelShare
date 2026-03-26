package ProyectoAngularJava.example.demo.model;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;
import java.util.List;
import lombok.Getter;
import lombok.Setter;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;

@Entity
@Table(name = "pixels")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class Pixel {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    private int x;
    private int y;
    private String color;
    private Integer size;
    private Long roomId;
    private String type; // For WebSocket control messages (e.g., "HOST_CLOSED", "RESIZE") e.g. "RECT", "CIRCLE"

    private Integer width; // Used in RESIZE and shape messages

    private Integer height; // Used in RESIZE and shape messages

    @Transient
    private Integer fromX; // Previous X position for line segment drawing (not persisted)

    @Transient
    private Integer fromY; // Previous Y position for line segment drawing (not persisted)

    @Transient
    private boolean allowAllDraw = true; // For SETTINGS_UPDATE messages

    @Transient
    private boolean allowAllClear = true; // For SETTINGS_UPDATE messages

    @Transient
    private List<Pixel> pixelHistory; // For INIT_PIXELS messages
}
