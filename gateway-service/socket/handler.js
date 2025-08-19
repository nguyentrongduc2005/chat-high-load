const rateLimit = require('express-rate-limit');

class SocketHandler {
    constructor(io, redisClient) {
        this.io = io;
        this.redisClient = redisClient;
        this.connectedUsers = new Map();
        
        // Rate limiting for socket events
        this.messageRateLimit = new Map();
        
        this.setupSocketEvents();
    }

    setupSocketEvents() {
        this.io.on('connection', (socket) => {
            console.log(`User connected: ${socket.id}`);
            
            // Authentication
            socket.on('authenticate', async (data) => {
                await this.handleAuthentication(socket, data);
            });

            // Join room
            socket.on('join-room', async (data) => {
                await this.handleJoinRoom(socket, data);
            });

            // Leave room
            socket.on('leave-room', async (data) => {
                await this.handleLeaveRoom(socket, data);
            });

            // Send message
            socket.on('send-message', async (data) => {
                await this.handleSendMessage(socket, data);
            });

            // Typing indicators
            socket.on('typing-start', (data) => {
                this.handleTypingStart(socket, data);
            });

            socket.on('typing-stop', (data) => {
                this.handleTypingStop(socket, data);
            });

            // Get online users
            socket.on('get-online-users', async (data) => {
                await this.handleGetOnlineUsers(socket, data);
            });

            // Disconnect
            socket.on('disconnect', () => {
                this.handleDisconnect(socket);
            });
        });
    }

    async handleAuthentication(socket, data) {
        try {
            const { userId, username } = data;
            
            if (!userId || !username) {
                socket.emit('auth-error', { message: 'Missing userId or username' });
                return;
            }

            // Store user info
            socket.userId = userId;
            socket.username = username;
            
            this.connectedUsers.set(socket.id, {
                userId,
                username,
                socketId: socket.id,
                connectedAt: new Date()
            });

            // Store in Redis for cross-instance communication
            await this.redisClient.hSet(
                'connected_users', 
                socket.id, 
                JSON.stringify({ userId, username, connectedAt: new Date() })
            );

            socket.emit('authenticated', { 
                success: true, 
                userId, 
                username 
            });

            console.log(`User authenticated: ${username} (${userId})`);
        } catch (error) {
            console.error('Authentication error:', error);
            socket.emit('auth-error', { message: 'Authentication failed' });
        }
    }

    async handleJoinRoom(socket, data) {
        try {
            const { roomId } = data;
            
            if (!socket.userId) {
                socket.emit('error', { message: 'Not authenticated' });
                return;
            }

            if (!roomId) {
                socket.emit('error', { message: 'Room ID required' });
                return;
            }

            // Join socket room
            socket.join(roomId);
            
            // Store room info
            if (!socket.rooms) {
                socket.rooms = new Set();
            }
            socket.rooms.add(roomId);

            // Notify others in room
            socket.to(roomId).emit('user-joined', {
                userId: socket.userId,
                username: socket.username,
                timestamp: new Date()
            });

            // Confirm join
            socket.emit('room-joined', { 
                roomId,
                message: `Joined room ${roomId}` 
            });

            console.log(`User ${socket.username} joined room ${roomId}`);
        } catch (error) {
            console.error('Join room error:', error);
            socket.emit('error', { message: 'Failed to join room' });
        }
    }

    async handleLeaveRoom(socket, data) {
        try {
            const { roomId } = data;
            
            if (!roomId) {
                socket.emit('error', { message: 'Room ID required' });
                return;
            }

            // Leave socket room
            socket.leave(roomId);
            
            // Remove from rooms set
            if (socket.rooms) {
                socket.rooms.delete(roomId);
            }

            // Notify others in room
            socket.to(roomId).emit('user-left', {
                userId: socket.userId,
                username: socket.username,
                timestamp: new Date()
            });

            socket.emit('room-left', { 
                roomId,
                message: `Left room ${roomId}` 
            });

            console.log(`User ${socket.username} left room ${roomId}`);
        } catch (error) {
            console.error('Leave room error:', error);
            socket.emit('error', { message: 'Failed to leave room' });
        }
    }

    async handleSendMessage(socket, data) {
        try {
            const { roomId, message } = data;
            
            if (!socket.userId) {
                socket.emit('error', { message: 'Not authenticated' });
                return;
            }

            if (!roomId || !message) {
                socket.emit('error', { message: 'Room ID and message required' });
                return;
            }

            // Rate limiting
            if (!this.checkRateLimit(socket.userId)) {
                socket.emit('error', { message: 'Rate limit exceeded' });
                return;
            }

            // Validate message length
            if (message.length > (process.env.MAX_MESSAGE_LENGTH || 1000)) {
                socket.emit('error', { message: 'Message too long' });
                return;
            }

            // Send to chat service via gRPC (will be handled by gateway's grpc client)
            const messageData = {
                userId: socket.userId,
                username: socket.username,
                roomId,
                content: message,
                timestamp: new Date(),
                messageId: this.generateMessageId()
            };

            // Broadcast to room
            this.io.to(roomId).emit('new-message', messageData);

            // Store in Redis for real-time sync
            await this.redisClient.lPush(
                `room:${roomId}:messages`,
                JSON.stringify(messageData)
            );

            // Keep only last 100 messages in Redis
            await this.redisClient.lTrim(`room:${roomId}:messages`, 0, 99);

            console.log(`Message sent by ${socket.username} in room ${roomId}`);
        } catch (error) {
            console.error('Send message error:', error);
            socket.emit('error', { message: 'Failed to send message' });
        }
    }

    handleTypingStart(socket, data) {
        const { roomId } = data;
        
        if (!socket.userId || !roomId) return;

        socket.to(roomId).emit('user-typing', {
            userId: socket.userId,
            username: socket.username,
            isTyping: true
        });
    }

    handleTypingStop(socket, data) {
        const { roomId } = data;
        
        if (!socket.userId || !roomId) return;

        socket.to(roomId).emit('user-typing', {
            userId: socket.userId,
            username: socket.username,
            isTyping: false
        });
    }

    async handleGetOnlineUsers(socket, data) {
        try {
            const { roomId } = data;
            
            if (!roomId) {
                socket.emit('error', { message: 'Room ID required' });
                return;
            }

            // Get users in socket room
            const room = this.io.sockets.adapter.rooms.get(roomId);
            const onlineUsers = [];

            if (room) {
                for (const socketId of room) {
                    const userSocket = this.io.sockets.sockets.get(socketId);
                    if (userSocket && userSocket.userId) {
                        onlineUsers.push({
                            userId: userSocket.userId,
                            username: userSocket.username
                        });
                    }
                }
            }

            socket.emit('online-users', { roomId, users: onlineUsers });
        } catch (error) {
            console.error('Get online users error:', error);
            socket.emit('error', { message: 'Failed to get online users' });
        }
    }

    async handleDisconnect(socket) {
        try {
            console.log(`User disconnected: ${socket.id}`);
            
            // Remove from connected users
            this.connectedUsers.delete(socket.id);
            
            // Remove from Redis
            await this.redisClient.hDel('connected_users', socket.id);

            // Notify rooms about user leaving
            if (socket.rooms) {
                for (const roomId of socket.rooms) {
                    socket.to(roomId).emit('user-left', {
                        userId: socket.userId,
                        username: socket.username,
                        timestamp: new Date()
                    });
                }
            }
        } catch (error) {
            console.error('Disconnect error:', error);
        }
    }

    checkRateLimit(userId) {
        const now = Date.now();
        const windowMs = 60 * 1000; // 1 minute
        const maxMessages = process.env.RATE_LIMIT_MESSAGES_PER_MINUTE || 60;

        if (!this.messageRateLimit.has(userId)) {
            this.messageRateLimit.set(userId, []);
        }

        const userMessages = this.messageRateLimit.get(userId);
        
        // Remove old messages outside the window
        const filtered = userMessages.filter(timestamp => now - timestamp < windowMs);
        
        if (filtered.length >= maxMessages) {
            return false;
        }

        filtered.push(now);
        this.messageRateLimit.set(userId, filtered);
        return true;
    }

    generateMessageId() {
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

module.exports = SocketHandler;
