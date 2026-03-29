FROM maven:3.9.4-eclipse-temurin-21 AS build
COPY . .
RUN mvn clean package -DskipTests

FROM eclipse-temurin:21-jre-jammy
COPY --from=build /target/pixelshare-1.0.0.jar app.jar
ENTRYPOINT ["java", "-jar", "/app.jar"]
