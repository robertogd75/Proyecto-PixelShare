package ProyectoAngularJava.example.demo.model;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;
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

    @Transient
    private String type; // For WebSocket control messages (e.g., "HOST_CLOSED", "RESIZE")

    @Transient
    private Integer width; // Used in RESIZE messages

    @Transient
    private Integer height; // Used in RESIZE messages
}
