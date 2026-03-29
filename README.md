# 🎨 PixelShare | Collaborative Real-Time Whiteboard

![PixelShare Demo](https://img.shields.io/badge/Status-Active-brightgreen) ![Angular](https://img.shields.io/badge/Frontend-Angular%2018-dd0031) ![Spring Boot](https://img.shields.io/badge/Backend-Spring%20Boot%203.4-6db33f) ![Docker](https://img.shields.io/badge/DevOps-Docker-2496ed)

**PixelShare** is a high-performance, real-time collaborative whiteboard where users can create private rooms, share ideas, and draw together seamlessly. Built with a focus on speed and accuracy, it leverages modern web technologies to provide a smooth, low-latency creative experience.

---

## ✨ Features

- **🚀 Real-Time Synchronization**: Powered by WebSockets (STOMP), ensuring that every stroke is visible to all participants instantly.
- **🛡️ Private & Public Rooms**: Create dedicated spaces with unique access codes.
- **🎨 Precision Drawing Engine**: Ratio-based coordinate mapping that remains accurate across all zoom levels and screen resolutions.
- **🛠️ Professional Toolset**:
  - Dynamic Brush with adjustable thickness.
  - Shape Tools: Lines, Rectangles, and Circles with real-time previews.
  - Smart Eraser and canvas clearing.
- **🔒 Governance Mode**: Room hosts can restrict drawing or clearing permissions to maintain order in large groups.
- **💾 Persistence**: Every pixel is saved in a MySQL database, so your work is never lost on refresh.

---

## 🏗️ Architecture

PixelShare follows a modern decoupled architecture:

- **Frontend**: Angular 18 (Standalone) with a custom Canvas API implementation for efficient rendering.
- **Backend**: Spring Boot 3.4 providing a robust REST API and WebSocket message broker.
- **Database**: MySQL 8 handling spatial pixel data and room metadata.
- **DevOps**: Fully containerized with Docker and optimized for production deployments.

---

## 🚀 Quick Start

### 🐳 Option 1: Docker (Recommended)
The fastest way to get PixelShare up and running is via Docker Compose:

1. Clone the repository: `git clone https://github.com/robertogd75/PixelShare.git`
2. Create a `.env` file (see `.env.example`).
3. Launch the stack:
   ```bash
   docker-compose up --build -d
   ```
4. Access the app at `http://localhost:4200` (or your configured port).

### 🛠️ Option 2: Manual Setup

#### Prerequisites
- **Java 21+**
- **Node.js 20+**
- **MySQL 8**

#### 1. Backend
```bash
cd Proyecto-PixelShare
# Configure src/main/resources/application.properties with your DB credentials
./mvnw spring-boot:run
```

#### 2. Frontend
```bash
cd frontend-demo
npm install
npm start
```

---

## 🛠️ Tech Stack & Dependencies

- **Frameworks**: Angular 18, Spring Boot 3.4
- **Persistence**: Spring Data JPA, Hibernate, MySQL Connector/J
- **Communication**: SockJS, STOMP, RxJS
- **Styling**: Vanilla CSS (Premium Dark Theme), Bootstrap 5 (Modals)
- **Utilities**: Lombok, Maven

---

## 👨‍💻 Author

**Roberto García Delgado**  
Full-Stack Developer  
🌐 [rgardel.es](https://rgardel.es)

---

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.
