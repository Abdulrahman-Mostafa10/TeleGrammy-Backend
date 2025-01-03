const mongoose = require("mongoose");
const {generateSignedUrl} = require("../middlewares/AWS");
const AppError = require("../errors/appError");

const messageSchema = new mongoose.Schema({
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: [true, "Sender ID is required"],
  },
  chatId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Chat",
    required: [true, "Chat ID is required"],
  },
  parentPost: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Message",
    default: null,
  },
  isPost: {
    type: Boolean,
    default: false,
  },
  commentsCount: {
    type: Number,
    default: 0,
  },
  messageType: {
    type: String,
    enum: {
      values: [
        "text",
        "image",
        "audio",
        "voice_note",
        "document",
        "sticker",
        "GIF",
        "video",
        "file",
        "link",
      ],
      message: "Message type is not valid",
    },
    required: [true, "Message type is required"],
  },
  replyOn: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Message",
    default: null,
  },
  isForwarded: {
    type: Boolean,
    default: false,
  },
  forwardedFrom: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Message",
    default: null,
  },
  isEdited: {
    type: Boolean,
    default: false,
  },
  mentions: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: "User",
    default: [],
  },
  viewers: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: "User",
    default: [],
  },
  recievers: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: "User",
    default: [],
  },
  status: {
    type: String,
    enum: {
      values: ["sending", "sent", "delivered", "seen", "failed"],
      message: "Status is not valid",
    },
    default: "sending",
  },
  content: {
    type: String,
    default: "",
  },
  mediaUrl: {
    type: String,
  },
  mediaKey: {
    type: String,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
  isPinned: {
    type: Boolean,
    default: false,
  },
  selfDestructTime: {type: Number}, // Time-to-live in seconds
  expiresAt: {type: Date}, // Exact expiration time for TTL
});

messageSchema.pre("save", function (next) {
  if (this.selfDestructTime) {
    this.expiresAt = new Date(
      this.timestamp.getTime() + this.selfDestructTime * 1000
    );
  }
  next();
});

messageSchema.post("save", async function (doc, next) {
  if (doc.parentPost) {
    try {
      // Increment the commentsCount of the parent post
      await mongoose.model("Message").findByIdAndUpdate(doc.parentPost, {
        $inc: {commentsCount: 1},
      });
      console.log(
        `Incremented commentsCount for parentPost: ${doc.parentPost}`
      );
    } catch (error) {
      console.error("Error updating commentsCount:", error);
    }
  }
  next();
});

messageSchema.methods.updateMessageViewer = async function (
  viewerId,
  numberOfMembersInChat
) {
  if (!this.viewers) this.viewers = [];
  if (!this.viewers.includes(viewerId)) {
    this.viewers.push(viewerId);
  }

  if (this.viewers.length >= numberOfMembersInChat - 1) {
    this.status = "seen";
  }
  await this.save();
};

messageSchema.methods.updateMessageRecivers = async function (
  recieverId,
  numberOfMembersInChat
) {
  if (!this.recievers) this.recievers = [];
  if (!this.recievers.includes(recieverId)) {
    this.recievers.push(recieverId);
  }
  if (this.recievers.length >= numberOfMembersInChat - 1) {
    this.status = "delivered";
  }

  await this.save();
};

messageSchema.methods.generateSignedUrl = async function () {
  try {
    if (this.mediaKey) {
      this.mediaUrl = await generateSignedUrl(this.mediaKey, 24 * 60 * 60);
    }
  } catch (err) {
    console.error(`Error generating url for story ${this._id}:`, err);
    this.mediaUrl = null;
  }
};

// this middleware is responsible for creating signed URLs to the retreived messages from the database
messageSchema.post(/^find/, async function (docs, next) {
  if (!docs || (Array.isArray(docs) && docs.length === 0)) {
    return next();
  }

  const documents = Array.isArray(docs) ? docs : [docs];
  await Promise.all(
    documents.map(async (doc) => {
      await doc.generateSignedUrl();
    })
  );

  return next();
});

messageSchema.pre(/^find/, function (next) {
  this.select(
    "content senderId messageType timestamp mediaUrl status mentions isEdited isForwarded replyOn mediaKey isPinned isPost commentsCount parentPost"
  ) // Only fetch relevant fields
    .populate("senderId mentions", "_id username email screenName")
    .populate("replyOn")
    .populate(
      "chatId",
      "name isGroup isChannel createdAt participants lastMessage groupId channelId lastMessageTimestamp"
    );

  next();
});

messageSchema.methods.pin = async function () {
  this.isPinned = true;
  await this.save();
};

messageSchema.methods.unpin = async function () {
  this.isPinned = false;
  await this.save();
};

messageSchema.statics.searchMessages = async function ({
  chatId,
  searchText,
  messageType,
  limit = 20,
  skip = 0,
}) {
  if (!searchText) {
    throw new AppError("Inapplicable to search", 400);
  }

  const query = {};

  if (chatId) {
    if (!mongoose.Types.ObjectId.isValid(chatId)) {
      throw new AppError("ChatId is not a valid ObjectId", 400);
    }
    query.chatId = chatId;
  }

  if (messageType) {
    query.messageType = messageType;
  }

  query.$or = [
    {content: {$regex: searchText, $options: "i"}},
    {mediaUrl: {$regex: searchText, $options: "i"}},
  ];

  try {
    const maxLimit = 100;
    limit = Math.min(limit, maxLimit);

    const messages = await this.find(query)
      .sort({timestamp: -1})
      .skip(skip)
      .limit(limit)
      .populate({
        path: "senderId",
        select: "username screenName email phone",
      })
      .populate({
        path: "chatId",
        select: "name",
      });

    return messages.map((message) => {
      const {senderId, chatId, ...rest} = message.toObject();
      return {
        ...rest,
        sender: senderId,
        chat: chatId,
      };
    });
  } catch (error) {
    throw new AppError("Error searching messages", 500);
  }
};

messageSchema.index({content: "text", mediaUrl: "text"});

messageSchema.index({expiresAt: 1}, {expireAfterSeconds: 0});

const Message = mongoose.model("Message", messageSchema);

module.exports = Message;
