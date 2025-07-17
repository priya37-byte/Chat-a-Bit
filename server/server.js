import express from "express";
import "dotenv/config";
import cors from "cors";
import http from "http";
import { connectDB } from "./lib/db.js";
import userRoutes from "./routes/userRoutes.js";
import messageRouter from "./routes/messageRoutes.js";
import { Server } from "socket.io";
import MessageModel from "./models/message.js";

// Create Express app
const app = express();
const server = http.createServer(app);

// Initialize Socket.IO server
export const io = new Server(server, {
  cors: { origin: "*" }
});

// Store online users
export const userSocketMap = {}; // { userId: socketId }

// Socket.IO connection handler
io.on("connection", (socket) => {
  const userId = socket.handshake.query.userId;
  console.log("User Connected:", userId);

  if (userId) userSocketMap[userId] = socket.id;

  io.emit("getOnlineUsers", Object.keys(userSocketMap));

  socket.on("disconnect", () => {
    console.log("User Disconnected:", userId);
    delete userSocketMap[userId];
    io.emit("getOnlineUsers", Object.keys(userSocketMap));
  });

  socket.on("sendMessage", async ({ senderId, receiverId, message }) => {
    try {
      const newMessage = new MessageModel({
        senderId,
        receiverId,
        ...message,
      });
      const savedMessage = await newMessage.save();

      const receiverSocketId = userSocketMap[receiverId];
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("newMessage", savedMessage);
      }

      socket.emit("messageSent", savedMessage);
    } catch (error) {
      console.error("Message send error:", error.message);
      socket.emit("error", "Failed to send message");
    }
  });
});

// Middleware
app.use(express.json({ limit: "4mb" }));
app.use(cors());

// Routes
app.use("/api/status", (req, res) => res.send("Server is live"));
app.use("/api/auth", userRoutes);
app.use("/api/messages", messageRouter);

// Connect to DB
await connectDB();

// ✅ No app.listen here (Vercel doesn't support it)

// ✅ Export the Express server (NOT the HTTP server)
export default app;
