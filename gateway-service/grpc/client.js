const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

class GrpcClient {
    constructor() {
        this.client = null;
        this.packageDefinition = null;
        this.proto = null;
    }

    async connect() {
        try {
            // Load proto file
            const PROTO_PATH = path.join(__dirname, '../chat.proto');
            this.packageDefinition = protoLoader.loadSync(PROTO_PATH, {
                keepCase: true,
                longs: String,
                enums: String,
                defaults: true,
                oneofs: true,
            });

            this.proto = grpc.loadPackageDefinition(this.packageDefinition).chat;

            // Create client
            const grpcHost = process.env.GRPC_HOST || 'localhost';
            const grpcPort = process.env.GRPC_PORT || '50051';
            
            this.client = new this.proto.ChatService(
                `${grpcHost}:${grpcPort}`,
                grpc.credentials.createInsecure()
            );

            // Test connection
            await this.ping();
            console.log('gRPC Client connected successfully');
        } catch (error) {
            console.error('Failed to connect gRPC client:', error);
            throw error;
        }
    }

    ping() {
        return new Promise((resolve, reject) => {
            this.client.ping({}, (error, response) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(response);
                }
            });
        });
    }

    createRoom(name, description) {
        return new Promise((resolve, reject) => {
            this.client.createRoom({ name, description }, (error, response) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(response);
                }
            });
        });
    }

    getRooms() {
        return new Promise((resolve, reject) => {
            this.client.getRooms({}, (error, response) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(response.rooms || []);
                }
            });
        });
    }

    joinRoom(userId, roomId) {
        return new Promise((resolve, reject) => {
            this.client.joinRoom({ userId, roomId }, (error, response) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(response);
                }
            });
        });
    }

    leaveRoom(userId, roomId) {
        return new Promise((resolve, reject) => {
            this.client.leaveRoom({ userId, roomId }, (error, response) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(response);
                }
            });
        });
    }

    sendMessage(userId, roomId, message) {
        return new Promise((resolve, reject) => {
            this.client.sendMessage({ 
                userId, 
                roomId, 
                content: message,
                timestamp: Date.now().toString()
            }, (error, response) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(response);
                }
            });
        });
    }

    getMessages(roomId, limit = 50, offset = 0) {
        return new Promise((resolve, reject) => {
            this.client.getMessages({ 
                roomId, 
                limit: parseInt(limit), 
                offset: parseInt(offset) 
            }, (error, response) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(response.messages || []);
                }
            });
        });
    }

    getUsersInRoom(roomId) {
        return new Promise((resolve, reject) => {
            this.client.getUsersInRoom({ roomId }, (error, response) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(response.users || []);
                }
            });
        });
    }

    close() {
        if (this.client) {
            this.client.close();
        }
    }
}

module.exports = GrpcClient;
