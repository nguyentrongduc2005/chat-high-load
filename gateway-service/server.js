const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const redis = require('redis');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createAdapter } = require('@socket.io/redis-adapter');
require('dotenv').config();

const GrpcClient = require('./grpc/client');
const SocketHandler = require('./socket/handler');

class GatewayService {
    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        this.port = process.env.PORT || 3001;
        
        this.setupMiddleware();
        this.setupRedis();
        this.setupSocket();
        this.setupGrpc();
        this.setupRoutes();
    }

    setupMiddleware() {
        // Security with relaxed CSP for Socket.IO
        this.app.use(helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-hashes'", "https://cdn.socket.io"],
                    scriptSrcAttr: ["'self'", "'unsafe-inline'"],
                    styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
                    connectSrc: ["'self'", "ws:", "wss:"],
                    fontSrc: ["'self'", "https:", "data:", "https://fonts.gstatic.com"],
                    imgSrc: ["'self'", "data:", "https:"],
                }
            }
        }));
        this.app.use(cors({
            origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
            credentials: true
        }));

        // Rate limiting
        const limiter = rateLimit({
            windowMs: 1 * 60 * 1000, // 1 minute
            max: 100, // limit each IP to 100 requests per windowMs
            message: 'Too many requests from this IP'
        });
        this.app.use(limiter);

        this.app.use(express.json());
        this.app.use(express.static('public'));
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
                console.log('Connected to Redis');
            });

            await this.redisClient.connect();
        } catch (error) {
            console.error('Failed to connect to Redis:', error);
        }
    }

    setupSocket() {
        this.io = socketIo(this.server, {
            cors: {
                origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
                methods: ['GET', 'POST']
            }
        });

        // Setup Redis adapter for Socket.IO clustering
        this.setupRedisAdapter();

        this.socketHandler = new SocketHandler(this.io, this.redisClient);
    }

    async setupRedisAdapter() {
        try {
            const pubClient = this.redisClient.duplicate();
            const subClient = this.redisClient.duplicate();
            
            await pubClient.connect();
            await subClient.connect();
            
            this.io.adapter(createAdapter(pubClient, subClient));
            console.log('Redis adapter setup successfully');
        } catch (error) {
            console.error('Failed to setup Redis adapter:', error);
        }
    }

    setupGrpc() {
        this.grpcClient = new GrpcClient();
    }

    setupRoutes() {
        // Health check
        this.app.get('/health', (req, res) => {
            res.json({ 
                status: 'OK', 
                service: 'gateway-service',
                port: this.port,
                timestamp: new Date().toISOString()
            });
        });

        // API routes
        this.app.get('/api/rooms', async (req, res) => {
            try {
                const rooms = await this.grpcClient.getRooms();
                res.json(rooms);
            } catch (error) {
                console.error('Error getting rooms:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        this.app.post('/api/rooms', async (req, res) => {
            try {
                const { name, description } = req.body;
                const room = await this.grpcClient.createRoom(name, description);
                res.json(room);
            } catch (error) {
                console.error('Error creating room:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        this.app.get('/api/rooms/:roomId/messages', async (req, res) => {
            try {
                const { roomId } = req.params;
                const { limit = 50, offset = 0 } = req.query;
                const messages = await this.grpcClient.getMessages(roomId, limit, offset);
                res.json(messages);
            } catch (error) {
                console.error('Error getting messages:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
    }

    async start() {
        try {
            await this.grpcClient.connect();
            
            this.server.listen(this.port, () => {
                console.log(`Gateway Service running on port ${this.port}`);
                console.log(`Socket.IO server ready`);
            });
        } catch (error) {
            console.error('Failed to start Gateway Service:', error);
            process.exit(1);
        }
    }

    async shutdown() {
        console.log('Shutting down Gateway Service...');
        
        if (this.redisClient) {
            await this.redisClient.quit();
        }
        
        if (this.grpcClient) {
            this.grpcClient.close();
        }
        
        this.server.close(() => {
            console.log('Gateway Service stopped');
            process.exit(0);
        });
    }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
    if (global.gatewayService) {
        await global.gatewayService.shutdown();
    }
});

process.on('SIGINT', async () => {
    if (global.gatewayService) {
        await global.gatewayService.shutdown();
    }
});

// Start the service
const gatewayService = new GatewayService();
global.gatewayService = gatewayService;
gatewayService.start();
