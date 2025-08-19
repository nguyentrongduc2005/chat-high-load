const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const redis = require('redis');
require('dotenv').config();

const ChatServiceImpl = require('./services/chatService');

class ChatServer {
    constructor() {
        this.server = null;
        this.redisClient = null;
        this.port = process.env.GRPC_PORT || 50051;
    }

    async init() {
        await this.setupRedis();
        this.setupGrpcServer();
    }

    async setupRedis() {
        try {
            this.redisClient = redis.createClient({
                url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`,
                password: process.env.REDIS_PASSWORD || undefined
            });

            this.redisClient.on('error', (err) => {
                console.error('Redis Client Error:', err);
            });

            this.redisClient.on('connect', () => {
                console.log('Chat Service connected to Redis');
            });

            await this.redisClient.connect();
        } catch (error) {
            console.error('Failed to connect to Redis:', error);
            throw error;
        }
    }

    setupGrpcServer() {
        // Load proto file
        const PROTO_PATH = path.join(__dirname, 'chat.proto');
        console.log('Loading proto file from:', PROTO_PATH);
        
        const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
            keepCase: true,
            longs: String,
            enums: String,
            defaults: true,
            oneofs: true,
        });

        const chatProto = grpc.loadPackageDefinition(packageDefinition).chat;

        // Create gRPC server
        this.server = new grpc.Server();

        // Initialize service implementation
        const chatService = new ChatServiceImpl(this.redisClient);

        // Add service to server
        this.server.addService(chatProto.ChatService.service, {
            ping: chatService.ping.bind(chatService),
            createRoom: chatService.createRoom.bind(chatService),
            getRooms: chatService.getRooms.bind(chatService),
            joinRoom: chatService.joinRoom.bind(chatService),
            leaveRoom: chatService.leaveRoom.bind(chatService),
            sendMessage: chatService.sendMessage.bind(chatService),
            getMessages: chatService.getMessages.bind(chatService),
            getUsersInRoom: chatService.getUsersInRoom.bind(chatService)
        });
    }

    async start() {
        return new Promise((resolve, reject) => {
            this.server.bindAsync(
                `0.0.0.0:${this.port}`,
                grpc.ServerCredentials.createInsecure(),
                (error, port) => {
                    if (error) {
                        reject(error);
                        return;
                    }

                    this.server.start();
                    console.log(`Chat Service gRPC server running on port ${port}`);
                    resolve(port);
                }
            );
        });
    }

    async shutdown() {
        console.log('Shutting down Chat Service...');
        
        if (this.redisClient) {
            await this.redisClient.quit();
        }
        
        if (this.server) {
            this.server.forceShutdown();
        }
        
        console.log('Chat Service stopped');
        process.exit(0);
    }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
    if (global.chatServer) {
        await global.chatServer.shutdown();
    }
});

process.on('SIGINT', async () => {
    if (global.chatServer) {
        await global.chatServer.shutdown();
    }
});

// Start the server
async function main() {
    try {
        const chatServer = new ChatServer();
        await chatServer.init();
        global.chatServer = chatServer;
        await chatServer.start();
    } catch (error) {
        console.error('Failed to start Chat Service:', error);
        process.exit(1);
    }
}

main();
