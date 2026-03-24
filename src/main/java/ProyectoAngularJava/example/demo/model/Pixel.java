package ProyectoAngularJava.example.demo.model;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;

@Entity
@Table(name = "pixels")
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

    public Pixel() {
    }

    public Pixel(Long id, int x, int y, String color, Integer size, Long roomId, String type, Integer width, Integer height) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.color = color;
        this.size = size;
        this.roomId = roomId;
        this.type = type;
        this.width = width;
        this.height = height;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public int getX() {
        return x;
    }

    public void setX(int x) {
        this.x = x;
    }

    public int getY() {
        return y;
    }

    public void setY(int y) {
        this.y = y;
    }

    public String getColor() {
        return color;
    }

    public void setColor(String color) {
        this.color = color;
    }

    public Integer getSize() {
        return size;
    }

    public void setSize(Integer size) {
        this.size = size;
    }

    public Long getRoomId() {
        return roomId;
    }

    public void setRoomId(Long roomId) {
        this.roomId = roomId;
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public Integer getWidth() {
        return width;
    }

    public void setWidth(Integer width) {
        this.width = width;
    }

    public Integer getHeight() {
        return height;
    }

    public void setHeight(Integer height) {
        this.height = height;
    }
}
