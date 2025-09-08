pipeline {
    agent any

    environment {
        DEV_PROJECT = 'trinity-dev'
        PROD_PROJECT = 'trinity-prod'
        EXPECTED_HOST_IP = '10.2.1.65'

        DEV_PATH = 'D:\\application\\dev\\TrinityFastAPIDjangoReact'
        PROD_PATH = 'D:\\application\\prod\\TrinityFastAPIDjangoReact'
    }

    stages {
        stage('Checkout Code') {
            steps {
                echo "📦 Checking out branch: ${env.BRANCH_NAME}"
                checkout scm
            }
        }

        stage('Prepare Compose & Env Files + Patch Settings') {
            steps {
                script {
                    def targetPath = (env.BRANCH_NAME == 'dev') ? env.DEV_PATH : env.PROD_PATH
                    def composeExample = (env.BRANCH_NAME == 'dev') ? 'docker-compose-dev.example.yml' : 'docker-compose.example.yml'
                    def composeFinal = (env.BRANCH_NAME == 'dev') ? 'docker-compose-dev.yml' : 'docker-compose.yml'

                    dir(targetPath) {
                        echo "🔍 Preparing ${composeFinal} with HOST_IP=${env.EXPECTED_HOST_IP}..."

                        // --- Docker Compose ---
                        def composeContent = readFile(composeExample)
                        def updatedCompose = composeContent.replace('${HOST_IP:-localhost}', env.EXPECTED_HOST_IP)
                        updatedCompose = updatedCompose.replace('${HOST_IP}', env.EXPECTED_HOST_IP)
                        writeFile file: composeFinal, text: updatedCompose
                        echo "✅ Created ${composeFinal}"

                        // --- .env files ---
                        def envFiles = [
                            "TrinityBackendDjango/.env.example",
                            "TrinityFrontend/.env.example"
                        ]

                        for (ef in envFiles) {
                            def envFile = ef.replace(".env.example", ".env")
                            if (fileExists(ef)) {
                                def content = readFile(ef)
                                def updated = content.replace('${HOST_IP:-localhost}', env.EXPECTED_HOST_IP)
                                updated = updated.replace('${HOST_IP}', env.EXPECTED_HOST_IP)
                                writeFile file: envFile, text: updated
                                echo "✅ Created ${envFile}"
                            } else {
                                echo "⚠️ Skipping missing file: ${ef}"
                            }
                        }

                        // --- Patch Django + FastAPI for CORS/CSRF ---
                        echo "⚙️ Ensuring ${env.EXPECTED_HOST_IP} is present in CORS/CSRF..."
                        writeFile file: 'patch_settings.py', text: """
import os

FILES = [
    "TrinityBackendDjango/config/settings.py",   # Django
    "TrinityBackendFastAPI/app/config.py",       # FastAPI (adjust if needed)
]

host_ip = "${env.EXPECTED_HOST_IP}"

for f in FILES:
    if not os.path.exists(f):
        print(f"⚠️ File not found: {f}")
        continue
    
    try:
        with open(f, "r", encoding="utf-8") as fh:
            content = fh.read()
        
        if host_ip in content:
            print(f"✅ {host_ip} already present in {f}")
        else:
            print(f"➕ Adding {host_ip} to {f}")
            # More robust replacement for CORS/CSRF settings
            if "ALLOWED_HOSTS" in content:
                content = content.replace("ALLOWED_HOSTS = [", f"ALLOWED_HOSTS = ['{host_ip}', ")
            if "CORS_ALLOWED_ORIGINS" in content:
                content = content.replace("CORS_ALLOWED_ORIGINS = [", f"CORS_ALLOWED_ORIGINS = ['http://{host_ip}:3000', ")
            if "CSRF_TRUSTED_ORIGINS" in content:
                content = content.replace("CSRF_TRUSTED_ORIGINS = [", f"CSRF_TRUSTED_ORIGINS = ['http://{host_ip}:3000', ")
            
            with open(f, "w", encoding="utf-8") as fh:
                fh.write(content)
            print(f"✅ Updated {f}")
    
    except Exception as e:
        print(f"❌ Error processing {f}: {e}")
"""
                        bat "python patch_settings.py"
                    }
                }
            }
        }

        stage('Deploy Dev Environment') {
            when { branch 'dev' }
            steps {
                dir("${env.DEV_PATH}") {
                    bat """
                        echo 🚀 Deploying DEV environment...
                        docker compose -p ${env.DEV_PROJECT} -f docker-compose-dev.yml down
                        docker compose -p ${env.DEV_PROJECT} -f docker-compose-dev.yml up --build -d --force-recreate

                        echo ⏳ Waiting for containers to start...
                        
                        REM Wait for containers to be created and running
                        set MAX_WAIT=60
                        set COUNTER=0
                        
                        :check_containers
                        set /a COUNTER+=1
                        
                        REM Get container ID
                        for /f %%i in ('docker compose -p ${env.DEV_PROJECT} -f docker-compose-dev.yml ps -q web 2^>nul') do set WEB_CONTAINER=%%i
                        
                        if not defined WEB_CONTAINER (
                            echo Container not found, waiting...
                            if %COUNTER% lss %MAX_WAIT% (
                                ping 127.0.0.1 -n 3 >nul
                                goto :check_containers
                            ) else (
                                echo ❌ Container failed to start
                                goto :error
                            )
                        )
                        
                        REM Check if container is running
                        for /f %%s in ('docker inspect -f "{{.State.Status}}" %WEB_CONTAINER% 2^>nul') do set CONTAINER_STATUS=%%s
                        
                        if "%CONTAINER_STATUS%"=="running" (
                            echo ✅ Web container is running ^(ID: %WEB_CONTAINER%^)
                            goto :container_ready
                        ) else (
                            echo Container status: %CONTAINER_STATUS%, waiting...
                            if %COUNTER% lss %MAX_WAIT% (
                                ping 127.0.0.1 -n 3 >nul
                                goto :check_containers
                            ) else (
                                echo ❌ Container failed to reach running state
                                goto :error
                            )
                        )
                        
                        :container_ready
                        echo ⏳ Giving application time to initialize...
                        ping 127.0.0.1 -n 11 >nul
                        
                        echo 🔧 Running tenant creation script...
                        docker compose -p ${env.DEV_PROJECT} -f docker-compose-dev.yml exec web python create_tenant.py
                        goto :success
                        
                        :error
                        echo 📋 Showing container logs for debugging:
                        docker compose -p ${env.DEV_PROJECT} -f docker-compose-dev.yml logs --tail=50 web
                        exit /b 1
                        
                        :success
                        echo ✅ Deployment completed successfully!
                    """
                }
            }
        }

        stage('Deploy Prod Environment') {
            when { branch 'main' }
            steps {
                dir("${env.PROD_PATH}") {
                    bat """
                        echo 🚀 Deploying PROD environment...
                        docker compose -p ${env.PROD_PROJECT} -f docker-compose.yml down
                        docker compose -p ${env.PROD_PROJECT} -f docker-compose.yml up --build -d --force-recreate

                        echo ⏳ Waiting for containers to start...
                        
                        REM Wait for containers to be created and running
                        set MAX_WAIT=60
                        set COUNTER=0
                        
                        :check_containers
                        set /a COUNTER+=1
                        
                        REM Get container ID
                        for /f %%i in ('docker compose -p ${env.PROD_PROJECT} -f docker-compose.yml ps -q web 2^>nul') do set WEB_CONTAINER=%%i
                        
                        if not defined WEB_CONTAINER (
                            echo Container not found, waiting...
                            if %COUNTER% lss %MAX_WAIT% (
                                ping 127.0.0.1 -n 3 >nul
                                goto :check_containers
                            ) else (
                                echo ❌ Container failed to start
                                goto :error
                            )
                        )
                        
                        REM Check if container is running
                        for /f %%s in ('docker inspect -f "{{.State.Status}}" %WEB_CONTAINER% 2^>nul') do set CONTAINER_STATUS=%%s
                        
                        if "%CONTAINER_STATUS%"=="running" (
                            echo ✅ Web container is running ^(ID: %WEB_CONTAINER%^)
                            goto :container_ready
                        ) else (
                            echo Container status: %CONTAINER_STATUS%, waiting...
                            if %COUNTER% lss %MAX_WAIT% (
                                ping 127.0.0.1 -n 3 >nul
                                goto :check_containers
                            ) else (
                                echo ❌ Container failed to reach running state
                                goto :error
                            )
                        )
                        
                        :container_ready
                        echo ⏳ Giving application time to initialize...
                        ping 127.0.0.1 -n 11 >nul
                        
                        echo 🔧 Running tenant creation script...
                        docker compose -p ${env.PROD_PROJECT} -f docker-compose.yml exec web python create_tenant.py
                        goto :success
                        
                        :error
                        echo 📋 Showing container logs for debugging:
                        docker compose -p ${env.PROD_PROJECT} -f docker-compose.yml logs --tail=50 web
                        exit /b 1
                        
                        :success
                        echo ✅ Deployment completed successfully!
                    """
                }
            }
        }
    }

    post {
        failure { echo "❌ Deployment failed on branch ${env.BRANCH_NAME}" }
        success { echo "✅ Deployment successful on branch ${env.BRANCH_NAME}" }
    }
}
