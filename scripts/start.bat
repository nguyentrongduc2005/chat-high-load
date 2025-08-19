@echo off
echo 🚀 Starting Chat High Load Application...

REM Check if Docker is running
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker is not running. Please start Docker first.
    pause
    exit /b 1
)

REM Check if docker-compose is available
docker-compose --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ docker-compose not found. Please install docker-compose.
    pause
    exit /b 1
)

REM Build and start services
echo 📦 Building and starting services...
docker-compose up --build -d

REM Wait for services to be ready
echo ⏳ Waiting for services to be ready...
timeout /t 30 /nobreak >nul

REM Check service health
echo 🔍 Checking service health...

REM Check Redis
docker-compose exec -T redis redis-cli ping >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Redis is ready
) else (
    echo ❌ Redis is not ready
)

REM Check Gateway Services
for %%p in (3001 3002 3003) do (
    curl -f http://localhost:%%p/health >nul 2>&1
    if !errorlevel! equ 0 (
        echo ✅ Gateway Service on port %%p is ready
    ) else (
        echo ❌ Gateway Service on port %%p is not ready
    )
)

REM Check Load Balancer
curl -f http://localhost/health >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Load Balancer is ready
) else (
    echo ❌ Load Balancer is not ready
)

echo.
echo 🎉 Application is running!
echo 🌐 Open http://localhost in your browser to access the chat application
echo 📊 Monitor with: docker-compose logs -f
echo 🛑 Stop with: scripts\stop.bat
pause
 ✔ gateway-service-1                             Built                                                                0.0s 
[+] Running 13/14igh_load_chat_network           Created                                                              0.0s 
 ✔ gateway-service-2                             Built                                                                0.0s 
 ✔ gateway-service-3                             Built                                                                0.0s 
 ✔ chat-service-1                                Built                                                                0.0s 
 ✔ chat-service-2                                Built                                                                0.0s 
 ✔ gateway-service-1                             Built                                                                0.0s 
[+] Running 13/14igh_load_chat_network           Created                                                              0.0s 
 ✔ gateway-service-2                             Built                                                                0.0s 
 ✔ gateway-service-3                             Built                                                                0.0s 
 ✔ chat-service-1                                Built                                                                0.0s 
 ✔ chat-service-2                                Built                                                                0.0s 
[+] Running 14/14                                Built                                                                0.0s 
 ✔ gateway-service-2                             Built                                                                0.0s 
[+] Running 14/14                                Built                                                                0.0s 
[+] Running 14/14                                Built                                                                0.0s 
[+] Running 14/14                                Built                                                                0.0s 
 ✔ gateway-service-2                             Built                                                                0.0s 
[+] Running 14/14                                Built                                                                0.0s 
 ✔ gateway-service-2                             Built                                                                0.0s 
[+] Running 14/14                                Built                                                                0.0s 
[+] Running 14/14                                Built                                                                0.0s 
 ✔ gateway-service-2                             Built                                                                0.0s 
[+] Running 14/14                                Built                                                                0.0s 
[+] Running 14/14                                Built                                                                0.0s 
[+] Running 14/14                                Built                                                                0.0s 
 ✔ gateway-service-2                             Built                                                                0.0s 
[+] Running 14/14                                Built                                                                0.0s 
 ✔ gateway-service-2                             Built                                                                0.0s 
 ✔ gateway-service-3                             Built                                                                0.0s 
[+] Running 14/14                                Built                                                                0.0s 
 ✔ gateway-service-2                             Built                                                                0.0s 
 ✔ gateway-service-3                             Built                                                                0.0s 
[+] Running 14/14                                Built                                                                0.0s 
 ✔ gateway-service-2                             Built                                                                0.0s 
[+] Running 14/14                                Built                                                                0.0s 
 ✔ gateway-service-2                             Built                                                                0.0s 
[+] Running 14/14                                Built                                                                0.0s 
[+] Running 14/14                                Built                                                                0.0s 
[+] Running 14/14                                Built                                                                0.0s 
 ✔ gateway-service-2                             Built                                                                0.0s 
 ✔ gateway-service-3                             Built                                                                0.0s 
 ✔ chat-service-1                                Built                                                                0.0s 
 ✔ chat-service-2                                Built                                                                0.0s 
 ✔ gateway-service-1                             Built                                                                0.0s 
 ✔ Network chat_high_load_chat_network           Created                                                              0.0s 
 ✔ Volume "chat_high_load_redis_data"            Created                                                              0.0s 
 ✔ Container chat_high_load-redis-1              Healthy                                                             11.7s 
 ✔ Container chat_high_load-chat-service-2-1     Started                                                             11.6s 
 ✘ Container chat_high_load-chat-service-1-1     Error                                                               12.6s 
 ✔ Container chat_high_load-gateway-service-3-1  Created                                                              0.1s 
 ✔ Container chat_high_load-gateway-service-2-1  Created                                                              0.1s 
 ✔ Container chat_high_load-gateway-service-1-1  Created                                                              0.1s 
 ✔ Container chat_high_load-nginx-1              Created                                                              0.1s 
dependency failed to start: container chat_high_load-chat-service-1-1 exited (1)
ΓÅ│ Waiting for services to be ready...
≡ƒöì Checking service health...
Γ£à Redis is ready
Γ¥î Gateway Service on port 3001 is not ready
Γ¥î Gateway Service on port 3002 is not ready
Γ¥î Gateway Service on port 3003 is not ready
Γ¥î Load Balancer is not ready

≡ƒÄë Application is running!
≡ƒîÉ Open http://localhost in your browser to access the chat application
≡ƒôè Monitor with: docker-compose logs -f
≡ƒ¢æ Stop with: scripts\stop.bat
Press any key to continue . . . 
PS D:\javacript\chat_high_load> 
