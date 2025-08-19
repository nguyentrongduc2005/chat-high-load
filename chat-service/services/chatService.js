const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const grpc = require('@grpc/grpc-js');

class ChatServiceImpl {
    constructor(redisClient) {
        this.redisClient = redisClient;
    }

    // Health check
    async ping(call, callback) {
        try {
            callback(null, { 
                success: true, 
                message: 'Chat Service is running',
                timestamp: Date.now().toString()
            });
        } catch (error) {
            callback(error);
        }
    }

    // Create a new chat room
    async createRoom(call, callback) {
        try {
            const { name, description } = call.request;
            
            if (!name) {
                return callback({
                    code: grpc.status.INVALID_ARGUMENT,
                    details: 'Room name is required'
                });
            }

            const roomId = uuidv4();
            const room = {
                id: roomId,
                name,
                description: description || '',
                createdAt: new Date().toISOString(),
                memberCount: 0
            };

            // Store room in Redis
            await this.redisClient.hSet(
                'rooms',
                roomId,
                JSON.stringify(room)
            );

            // Add to rooms list
            await this.redisClient.sAdd('room_ids', roomId);

            callback(null, { room });
            console.log(`Room created: ${name} (${roomId})`);
        } catch (error) {
            console.error('Create room error:', error);
            callback(error);
        }
    }

    // Get all chat rooms
    async getRooms(call, callback) {
        try {
            const roomIds = await this.redisClient.sMembers('room_ids');
            const rooms = [];

            for (const roomId of roomIds) {
                const roomData = await this.redisClient.hGet('rooms', roomId);
                if (roomData) {
                    const room = JSON.parse(roomData);
                    
                    // Get current member count
                    const memberCount = await this.redisClient.sCard(`room:${roomId}:members`);
                    room.memberCount = memberCount;
                    
                    rooms.push(room);
                }
            }

            callback(null, { rooms });
        } catch (error) {
            console.error('Get rooms error:', error);
            callback(error);
        }
    }

    // User joins a room
    async joinRoom(call, callback) {
        try {
            const { userId, roomId } = call.request;
            
            if (!userId || !roomId) {
                return callback({
                    code: grpc.status.INVALID_ARGUMENT,
                    details: 'User ID and Room ID are required'
                });
            }

            // Check if room exists
            const roomExists = await this.redisClient.hExists('rooms', roomId);
            if (!roomExists) {
                return callback({
                    code: grpc.status.NOT_FOUND,
                    details: 'Room not found'
                });
            }

            // Add user to room members
            await this.redisClient.sAdd(`room:${roomId}:members`, userId);
            
            // Add room to user's rooms
            await this.redisClient.sAdd(`user:${userId}:rooms`, roomId);

            // Store join event
            const joinEvent = {
                type: 'user_joined',
                userId,
                roomId,
                timestamp: new Date().toISOString()
            };

            await this.redisClient.lPush(
                `room:${roomId}:events`,
                JSON.stringify(joinEvent)
            );

            callback(null, { 
                success: true, 
                message: `User ${userId} joined room ${roomId}` 
            });

            console.log(`User ${userId} joined room ${roomId}`);
        } catch (error) {
            console.error('Join room error:', error);
            callback(error);
        }
    }

    // User leaves a room
    async leaveRoom(call, callback) {
        try {
            const { userId, roomId } = call.request;
            
            if (!userId || !roomId) {
                return callback({
                    code: grpc.status.INVALID_ARGUMENT,
                    details: 'User ID and Room ID are required'
                });
            }

            // Remove user from room members
            await this.redisClient.sRem(`room:${roomId}:members`, userId);
            
            // Remove room from user's rooms
            await this.redisClient.sRem(`user:${userId}:rooms`, roomId);

            // Store leave event
            const leaveEvent = {
                type: 'user_left',
                userId,
                roomId,
                timestamp: new Date().toISOString()
            };

            await this.redisClient.lPush(
                `room:${roomId}:events`,
                JSON.stringify(leaveEvent)
            );

            callback(null, { 
                success: true, 
                message: `User ${userId} left room ${roomId}` 
            });

            console.log(`User ${userId} left room ${roomId}`);
        } catch (error) {
            console.error('Leave room error:', error);
            callback(error);
        }
    }

    // Send a message
    async sendMessage(call, callback) {
        try {
            const { userId, roomId, content, timestamp } = call.request;
            
            if (!userId || !roomId || !content) {
                return callback({
                    code: grpc.status.INVALID_ARGUMENT,
                    details: 'User ID, Room ID, and content are required'
                });
            }

            // Check if user is in room
            const isMember = await this.redisClient.sIsMember(`room:${roomId}:members`, userId);
            if (!isMember) {
                return callback({
                    code: grpc.status.PERMISSION_DENIED,
                    details: 'User is not a member of this room'
                });
            }

            const messageId = uuidv4();
            const message = {
                id: messageId,
                userId,
                roomId,
                content,
                timestamp: timestamp || new Date().toISOString(),
                type: 'message'
            };

            // Store message in Redis
            await this.redisClient.hSet(
                'messages',
                messageId,
                JSON.stringify(message)
            );

            // Add to room messages list
            await this.redisClient.lPush(
                `room:${roomId}:message_ids`,
                messageId
            );

            // Keep only last 1000 messages per room
            await this.redisClient.lTrim(`room:${roomId}:message_ids`, 0, 999);

            // Publish to Redis for real-time updates
            await this.redisClient.publish(
                `room:${roomId}:messages`,
                JSON.stringify(message)
            );

            callback(null, { 
                message,
                success: true 
            });

            console.log(`Message sent by ${userId} in room ${roomId}`);
        } catch (error) {
            console.error('Send message error:', error);
            callback(error);
        }
    }

    // Get messages from a room
    async getMessages(call, callback) {
        try {
            const { roomId, limit = 50, offset = 0 } = call.request;
            
            if (!roomId) {
                return callback({
                    code: grpc.status.INVALID_ARGUMENT,
                    details: 'Room ID is required'
                });
            }

            // Get message IDs with pagination
            const messageIds = await this.redisClient.lRange(
                `room:${roomId}:message_ids`,
                offset,
                offset + limit - 1
            );

            const messages = [];
            for (const messageId of messageIds) {
                const messageData = await this.redisClient.hGet('messages', messageId);
                if (messageData) {
                    messages.push(JSON.parse(messageData));
                }
            }

            // Sort by timestamp (newest first)
            messages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            callback(null, { messages });
        } catch (error) {
            console.error('Get messages error:', error);
            callback(error);
        }
    }

    // Get users in a room
    async getUsersInRoom(call, callback) {
        try {
            const { roomId } = call.request;
            
            if (!roomId) {
                return callback({
                    code: grpc.status.INVALID_ARGUMENT,
                    details: 'Room ID is required'
                });
            }

            // Get user IDs in room
            const userIds = await this.redisClient.sMembers(`room:${roomId}:members`);
            
            const users = [];
            for (const userId of userIds) {
                // Get user info if stored
                const userData = await this.redisClient.hGet('users', userId);
                if (userData) {
                    users.push(JSON.parse(userData));
                } else {
                    // Basic user info
                    users.push({ userId });
                }
            }

            callback(null, { users });
        } catch (error) {
            console.error('Get users in room error:', error);
            callback(error);
        }
    }

    // Helper method to clean up old data
    async cleanupOldData() {
        try {
            const thirtyDaysAgo = moment().subtract(30, 'days').toISOString();
            
            // This could be expanded to clean up old messages, events, etc.
            console.log('Cleanup task running...');
            
            // Example: Remove old events
            const roomIds = await this.redisClient.sMembers('room_ids');
            for (const roomId of roomIds) {
                const events = await this.redisClient.lRange(`room:${roomId}:events`, 0, -1);
                const recentEvents = events.filter(eventStr => {
                    const event = JSON.parse(eventStr);
                    return event.timestamp > thirtyDaysAgo;
                });
                
                if (recentEvents.length !== events.length) {
                    await this.redisClient.del(`room:${roomId}:events`);
                    for (const eventStr of recentEvents) {
                        await this.redisClient.lPush(`room:${roomId}:events`, eventStr);
                    }
                }
            }
        } catch (error) {
            console.error('Cleanup error:', error);
        }
    }
}

module.exports = ChatServiceImpl;
