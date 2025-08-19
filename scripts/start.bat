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
