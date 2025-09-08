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
                        
                        // Create Python script with proper encoding handling and smart patching
                        writeFile file: 'patch_settings.py', text: """# -*- coding: utf-8 -*-
import os
import re

FILES = [
    "TrinityBackendDjango/config/settings.py",
    "TrinityBackendFastAPI/app/config.py"
]

host_ip = "${env.EXPECTED_HOST_IP}"
host_url = "http://" + host_ip + ":3000"

def patch_django_settings(content, host_ip, host_url):
    lines = content.split('\\n')
    modified = False
    
    for i, line in enumerate(lines):
        # Handle ALLOWED_HOSTS
        if line.strip().startswith('ALLOWED_HOSTS') and host_ip not in content:
            if '=' in line and '[' in line:
                # Simple list assignment
                if line.strip().endswith(']'):
                    lines[i] = line.replace(']', ", '" + host_ip + "']")
                    modified = True
                else:
                    # Multi-line or complex assignment - find the closing bracket
                    for j in range(i, len(lines)):
                        if ']' in lines[j]:
                            lines[j] = lines[j].replace(']', ", '" + host_ip + "']")
                            modified = True
                            break
        
        # Handle CORS_ALLOWED_ORIGINS
        elif line.strip().startswith('CORS_ALLOWED_ORIGINS') and host_url not in content:
            if '=' in line and '[' in line:
                if line.strip().endswith(']'):
                    lines[i] = line.replace(']', ", '" + host_url + "']")
                    modified = True
                else:
                    for j in range(i, len(lines)):
                        if ']' in lines[j]:
                            lines[j] = lines[j].replace(']', ", '" + host_url + "']")
                            modified = True
                            break
        
        # Handle CSRF_TRUSTED_ORIGINS  
        elif line.strip().startswith('CSRF_TRUSTED_ORIGINS') and host_url not in content:
            if '=' in line and '[' in line:
                if line.strip().endswith(']'):
                    lines[i] = line.replace(']', ", '" + host_url + "']")
                    modified = True
                else:
                    for j in range(i, len(lines)):
                        if ']' in lines[j] and 'for' not in lines[j]:  # Avoid list comprehensions
                            lines[j] = lines[j].replace(']', ", '" + host_url + "']")
                            modified = True
                            break
    
    return '\\n'.join(lines), modified

for f in FILES:
    if not os.path.exists(f):
        print("File not found: " + f)
        continue
    
    try:
        with open(f, "r", encoding="utf-8") as fh:
            content = fh.read()
        
        if host_ip in content and host_url in content:
            print("Host IP and URL already present in " + f)
            continue
        
        print("Processing " + f)
        new_content, was_modified = patch_django_settings(content, host_ip, host_url)
        
        if was_modified:
            with open(f, "w", encoding="utf-8") as fh:
                fh.write(new_content)
            print("Updated " + f)
        else:
            print("No changes needed for " + f)
    
    except Exception as e:
        print("Error processing " + f + ": " + str(e))
""", encoding: 'UTF-8'
                        
                        // Run Python script with explicit UTF-8 handling
                        bat """
                            chcp 65001 >nul 2>&1
                            python patch_settings.py
                        """
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
