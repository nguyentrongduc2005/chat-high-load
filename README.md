# Chat High Load - Microservices

Dự án chat room chịu tải cao với kiến trúc microservices: 3 Gateway Services (Socket.IO) + 1 Chat Service (gRPC) + Load Balancer (Nginx) + Redis.

## Cách chạy

```bash
# Khởi động
docker-compose up --build -d

# Kiểm tra
docker-compose ps

# Truy cập
http://localhost/chat.html
```

## Kết quả Test

### Load Test Performance:
- ✅ **30 concurrent clients** kết nối thành công
- ✅ **129+ messages** được gửi và xử lý  
- ✅ **Resource usage thấp**: <1% CPU, ~55MB RAM/service
- ✅ **Load balancing** hoạt động tốt qua 3 instances

### Container Stats:
```
SERVICE             CPU     MEMORY      STATUS
nginx               0.00%   2.82MB     Running
gateway-service-1   0.00%   56.98MB    Running  
gateway-service-2   0.00%   56.64MB    Running
gateway-service-3   0.00%   56.54MB    Running
chat-service-1      0.00%   51.25MB    Running
redis               0.55%   5.00MB     Running
```

## Load Testing

```bash
# Chạy load test với 30 clients
node scripts/simple-load-test.js
```
