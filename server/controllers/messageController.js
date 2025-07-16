import cloudinary from "../lib/cloudinary.js";
import Message from "../models/message.js";
import User from "../models/User.js";
import { io, userSocketMap } from "../server.js";

// ✅ Get all users except the logged-in user
export const getUsersForSidebar = async (req, res) => {
  try {
    const userId = req.user._id;
    const filteredUser = await User.find({ _id: { $ne: userId } }).select("-password");

    // Count number of unseen messages from each user
    const unseenMessages = {};
    const promises = filteredUser.map(async (user) => {
      const messages = await Message.find({ senderId: user._id, receiverId: userId, seen: false });
      if (messages.length > 0) {
        unseenMessages[user._id] = messages.length;
      }
      return null;
    });

    await Promise.all(promises);

    res.json({ success: true, users: filteredUser, unseenMessages });
  } catch (error) {
    console.error("getUsersForSidebar error:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Get all messages between current user and selected user
export const getMessages = async (req, res) => {
  try {
    const { id: selectedUserId } = req.params;
    const myId = req.user._id;

    const messages = await Message.find({
      $or: [
        { senderId: myId, receiverId: selectedUserId },
        { senderId: selectedUserId, receiverId: myId },
      ]
    }).sort({ createdAt: 1 }); // optional: show in ascending order

    // Mark unseen messages as seen
    await Message.updateMany(
      { senderId: selectedUserId, receiverId: myId, seen: false },
      { seen: true }
    );

    res.json({ success: true, messages });
  } catch (error) {
    console.error("getMessages error:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Mark a specific message as seen
export const markMessageAsSeen = async (req, res) => {
  try {
    const { id } = req.params;
    await Message.findByIdAndUpdate(id, { seen: true });
    res.json({ success: true });
  } catch (error) {
    console.error("markMessageAsSeen error:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Send a message (text or image) and emit to receiver if online
export const sendMessage = async (req, res) => {
  try {
    const { text, image } = req.body;
    const receiverId = req.params.id;
    const senderId = req.user._id;

    let imageUrl;
    if (image) {
      const uploadResponse = await cloudinary.uploader.upload(image);
      imageUrl = uploadResponse?.secure_url;
    }

    const newMessage = await Message.create({
      senderId,
      receiverId,
      text,
      image: imageUrl,
    });

    // ✅ Emit real-time message if receiver is online
    const receiverSocketId = userSocketMap[receiverId];
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("newMessage", newMessage);
    }

    res.json({ success: true, newMessage });
  } catch (error) {
    console.error("sendMessage error:", error.message);
    res.status(500).json({ success: false, message: "Failed to send message" });
  }
};
