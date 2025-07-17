const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const http = require("http");
const { connectDB } = require("./lib/db.js");
const userRoutes = require("./routes/userRoutes.js");
const messageRouter = require("./routes/messageRoutes.js");
const { Server } = require("socket.io");
const MessageModel = require("./models/message.js");

// Load environment variables
dotenv.config();

// Create Express app and HTTP server
const app = express();
const server = http.createServer(app);

// Initialize Socket.IO server
const io = new Server(server, {
  cors: { origin: "*" },
});

// Store online users
const userSocketMap = {}; // { userId: socketId }

// Socket.IO connection handler
io.on("connection", (socket) => {
  const userId = socket.handshake.query.userId;
  console.log("User Connected:", userId);

  if (userId) userSocketMap[userId] = socket.id;

  // Emit online users to all clients
  io.emit("getOnlineUsers", Object.keys(userSocketMap));

  // Handle disconnect
  socket.on("disconnect", () => {
    console.log("User Disconnected:", userId);
    delete userSocketMap[userId];
    io.emit("getOnlineUsers", Object.keys(userSocketMap));
  });

  // Handle incoming message and emit to receiver if online
  socket.on("sendMessage", async ({ senderId, receiverId, message }) => {
    try {
      // Save message to DB
      const newMessage = new MessageModel({
        senderId,
        receiverId,
        ...message,
      });
      const savedMessage = await newMessage.save();

      // Emit to receiver if they're online
      const receiverSocketId = userSocketMap[receiverId];
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("newMessage", savedMessage);
      }

      // Emit to sender for sync
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

// Connect to MongoDB
connectDB();

// Start server locally only if not in production
if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 5000;
  server.listen(PORT, () => console.log("Server running on PORT:", PORT));
}

// Export the Express app for Vercel
module.exports = app; // ✅ THIS FIXES THE ERROR!

