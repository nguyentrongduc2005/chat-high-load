const io = require('socket.io-client');
const axios = require('axios');

class SimpleLoadTest {
    constructor() {
        this.baseUrl = 'http://localhost';
        this.socketUrl = 'http://localhost';
        this.clients = [];
        this.stats = {
            connected: 0,
            messagesReceived: 0,
            messagesSent: 0,
            apiCalls: 0,
            errors: 0
        };
    }

    async createRoom() {
        try {
            const response = await axios.post(`${this.baseUrl}/api/rooms`, {
                name: `LoadTest_${Date.now()}`,
                description: 'Room created by load test'
            });
            console.log('Room created:', response.data.room.id);
            return response.data.room.id;
        } catch (error) {
            console.error('Error creating room:', error.message);
            this.stats.errors++;
            return null;
        }
    }

    createClient(clientId, roomId) {
        const socket = io(this.socketUrl, {
            transports: ['websocket'],
            forceNew: true
        });

        socket.on('connect', () => {
            console.log(`Client ${clientId} connected`);
            this.stats.connected++;
            
            // Authenticate
            socket.emit('authenticate', {
                userId: `user_${clientId}`,
                username: `TestUser_${clientId}`
            });

            // Join room
            setTimeout(() => {
                socket.emit('join-room', { roomId });
            }, 100);

            // Send messages periodically
            const messageInterval = setInterval(() => {
                socket.emit('send-message', {
                    roomId,
                    message: `Hello from client ${clientId} at ${new Date().toISOString()}`
                });
                this.stats.messagesSent++;
            }, 2000 + Math.random() * 3000); // Random interval between 2-5 seconds

            // Store interval for cleanup
            socket.messageInterval = messageInterval;
        });

        socket.on('message-received', (data) => {
            this.stats.messagesReceived++;
        });

        socket.on('disconnect', () => {
            console.log(`Client ${clientId} disconnected`);
            this.stats.connected--;
            if (socket.messageInterval) {
                clearInterval(socket.messageInterval);
            }
        });

        socket.on('error', (error) => {
            console.error(`Client ${clientId} error:`, error);
            this.stats.errors++;
        });

        return socket;
    }

    async apiLoadTest() {
        // Test API endpoints
        setInterval(async () => {
            try {
                // Test health endpoint
                await axios.get(`${this.baseUrl}/health`);
                
                // Test rooms endpoint
                await axios.get(`${this.baseUrl}/api/rooms`);
                
                this.stats.apiCalls += 2;
            } catch (error) {
                this.stats.errors++;
            }
        }, 1000);
    }

    async startLoadTest(numberOfClients = 50) {
        console.log(`Starting load test with ${numberOfClients} clients...`);
        
        // Create a test room
        const roomId = await this.createRoom();
        if (!roomId) {
            console.error('Failed to create room, aborting test');
            return;
        }

        // Start API load testing
        this.apiLoadTest();

        // Create clients gradually
        for (let i = 0; i < numberOfClients; i++) {
            setTimeout(() => {
                const client = this.createClient(i, roomId);
                this.clients.push(client);
            }, i * 100); // 100ms delay between each client
        }

        // Print statistics every 5 seconds
        const statsInterval = setInterval(() => {
            console.log('\\n--- Load Test Statistics ---');
            console.log(`Connected clients: ${this.stats.connected}`);
            console.log(`Messages sent: ${this.stats.messagesSent}`);
            console.log(`Messages received: ${this.stats.messagesReceived}`);
            console.log(`API calls: ${this.stats.apiCalls}`);
            console.log(`Errors: ${this.stats.errors}`);
            console.log('----------------------------\\n');
        }, 5000);

        // Run for 2 minutes then cleanup
        setTimeout(() => {
            console.log('Cleaning up load test...');
            clearInterval(statsInterval);
            
            this.clients.forEach(client => {
                client.disconnect();
            });
            
            console.log('Load test completed!');
            console.log('Final Statistics:', this.stats);
            process.exit(0);
        }, 120000); // 2 minutes
    }
}

// Check if script is run directly
if (require.main === module) {
    const loadTest = new SimpleLoadTest();
    loadTest.startLoadTest(30) // Start with 30 clients
        .catch(console.error);
}

module.exports = SimpleLoadTest;
