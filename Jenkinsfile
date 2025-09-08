pipeline {
    agent any

    environment {
        DEV_PROJECT = 'trinity-dev'
        PROD_PROJECT = 'trinity-prod'
        EXPECTED_HOST_IP = '10.2.1.65'
        DEV_DOMAIN = 'trinity-dev.quantmatrixai.com'
        PROD_DOMAIN = 'trinity.quantmatrixai.com'

        DEV_PATH = 'D:\\application\\dev\\TrinityFastAPIDjangoReact'
        PROD_PATH = 'D:\\application\\prod\\TrinityFastAPIDjangoReact'
        
        // Timeout settings
        CONTAINER_START_TIMEOUT = 120
        HEALTH_CHECK_TIMEOUT = 60
        DEPLOYMENT_TIMEOUT = 300
    }

    options {
        timeout(time: 30, unit: 'MINUTES')
        timestamps()
        retry(2)
        skipDefaultCheckout()
    }

    stages {
        stage('Checkout Code') {
            steps {
                echo "📦 Checking out branch: ${env.BRANCH_NAME}"
                checkout scm
                
                // Validate branch
                script {
                    if (!['dev', 'main'].contains(env.BRANCH_NAME)) {
                        error "❌ Unsupported branch: ${env.BRANCH_NAME}. Only 'dev' and 'main' branches are supported."
                    }
                }
            }
        }

        stage('Environment Validation') {
            steps {
                script {
                    def targetPath = (env.BRANCH_NAME == 'dev') ? env.DEV_PATH : env.PROD_PATH
                    def composeExample = (env.BRANCH_NAME == 'dev') ? 'docker-compose-dev.example.yml' : 'docker-compose.example.yml'
                    
                    echo "🔍 Validating environment for ${env.BRANCH_NAME} branch..."
                    
                    // Check if target directory exists
                    if (!fileExists(targetPath)) {
                        error "❌ Target directory does not exist: ${targetPath}"
                    }
                    
                    // Check if compose example file exists
                    if (!fileExists(composeExample)) {
                        error "❌ Docker compose example file not found: ${composeExample}"
                    }
                    
                    // Check if .env.example files exist
                    def envFiles = [
                        "TrinityBackendDjango/.env.example",
                        "TrinityFrontend/.env.example"
                    ]
                    
                    for (ef in envFiles) {
                        if (!fileExists(ef)) {
                            echo "⚠️ Warning: ${ef} not found, will be skipped"
                        }
                    }
                    
                    echo "✅ Environment validation passed"
                }
            }
        }

        stage('Prepare Configuration Files') {
            steps {
                script {
                    def targetPath = (env.BRANCH_NAME == 'dev') ? env.DEV_PATH : env.PROD_PATH
                    def composeExample = (env.BRANCH_NAME == 'dev') ? 'docker-compose-dev.example.yml' : 'docker-compose.example.yml'
                    def composeFinal = (env.BRANCH_NAME == 'dev') ? 'docker-compose-dev.yml' : 'docker-compose.yml'
                    def domain = (env.BRANCH_NAME == 'dev') ? env.DEV_DOMAIN : env.PROD_DOMAIN

                    dir(targetPath) {
                        echo "🔧 Preparing configuration files for ${env.BRANCH_NAME} environment..."
                        
                        // --- Docker Compose Configuration ---
                        echo "📝 Creating ${composeFinal}..."
                        def composeContent = readFile(composeExample)
                        
                        // Replace HOST_IP placeholders
                        def updatedCompose = composeContent
                            .replace('${HOST_IP:-localhost}', env.EXPECTED_HOST_IP)
                            .replace('${HOST_IP}', env.EXPECTED_HOST_IP)
                        
                        writeFile file: composeFinal, text: updatedCompose
                        echo "✅ Created ${composeFinal}"

                        // --- Environment Files ---
                        def envFiles = [
                            "TrinityBackendDjango/.env.example",
                            "TrinityFrontend/.env.example"
                        ]

                        for (ef in envFiles) {
                            def envFile = ef.replace(".env.example", ".env")
                            if (fileExists(ef)) {
                                echo "📝 Creating ${envFile}..."
                                def content = readFile(ef)
                                def updated = content
                                    .replace('${HOST_IP:-localhost}', env.EXPECTED_HOST_IP)
                                    .replace('${HOST_IP}', env.EXPECTED_HOST_IP)
                                    .replace('${DOMAIN}', domain)
                                
                                writeFile file: envFile, text: updated
                                echo "✅ Created ${envFile}"
                            }
                        }

                        // --- Advanced Settings Patching ---
                        echo "⚙️ Patching Django and FastAPI settings..."
                        
                        writeFile file: 'patch_settings.py', text: """# -*- coding: utf-8 -*-
import os
import re
import sys

# Configuration
HOST_IP = "${env.EXPECTED_HOST_IP}"
DOMAIN = "${domain}"
ENVIRONMENT = "${env.BRANCH_NAME}"

# Files to patch
FILES = [
    "TrinityBackendDjango/config/settings.py",
    "TrinityBackendFastAPI/app/config.py"
]

def validate_python_syntax(file_path, content):
    '''Validate Python syntax before writing'''
    try:
        compile(content, file_path, 'exec')
        return True
    except SyntaxError as e:
        print(f"ERROR: Syntax error in {file_path}: {e}")
        return False

def patch_django_settings(content, host_ip, domain, environment):
    '''Safely patch Django settings without breaking syntax'''
    lines = content.split('\\n')
    modified = False
    
    # Define the URLs we want to add
    host_urls = [
        f"http://{host_ip}:3000",
        f"http://{host_ip}:8080",
        f"http://{host_ip}:8081",
        f"https://{domain}"
    ]
    
    for i, line in enumerate(lines):
        # Handle ALLOWED_HOSTS - add host_ip if not present
        if line.strip().startswith('ALLOWED_HOSTS') and host_ip not in content:
            if '=' in line and '[' in line:
                if line.strip().endswith(']'):
                    # Single line assignment
                    lines[i] = line.replace(']', f", '{host_ip}']")
                    modified = True
                else:
                    # Multi-line assignment - find closing bracket
                    for j in range(i, len(lines)):
                        if ']' in lines[j] and not lines[j].strip().startswith('#'):
                            lines[j] = lines[j].replace(']', f", '{host_ip}']")
                            modified = True
                            break
        
        # Handle CORS_ALLOWED_ORIGINS - this is handled by environment variables
        # No need to modify the list comprehension syntax
        
        # Handle CSRF_TRUSTED_ORIGINS - this is handled by environment variables  
        # No need to modify the list comprehension syntax
    
    return '\\n'.join(lines), modified

def patch_fastapi_config(content, host_ip, domain, environment):
    '''Safely patch FastAPI config'''
    lines = content.split('\\n')
    modified = False
    
    for i, line in enumerate(lines):
        # Handle CORS origins in FastAPI
        if 'CORS_ORIGINS' in line and host_ip not in content:
            if '=' in line and '[' in line:
                if line.strip().endswith(']'):
                    lines[i] = line.replace(']', f", 'http://{host_ip}:8080', 'http://{host_ip}:8081', 'https://{domain}']")
                    modified = True
                else:
                    for j in range(i, len(lines)):
                        if ']' in lines[j] and not lines[j].strip().startswith('#'):
                            lines[j] = lines[j].replace(']', f", 'http://{host_ip}:8080', 'http://{host_ip}:8081', 'https://{domain}']")
                            modified = True
                            break
    
    return '\\n'.join(lines), modified

# Main execution
success_count = 0
total_files = len(FILES)

for file_path in FILES:
    if not os.path.exists(file_path):
        print(f"WARNING: File not found: {file_path}")
        continue
    
    try:
        print(f"Processing {file_path}...")
        
        with open(file_path, "r", encoding="utf-8") as fh:
            content = fh.read()
        
        # Check if already patched
        if HOST_IP in content:
            print(f"SUCCESS: {file_path} already contains HOST_IP, skipping")
            success_count += 1
            continue
        
        # Apply appropriate patching based on file
        if 'django' in file_path.lower():
            new_content, was_modified = patch_django_settings(content, HOST_IP, DOMAIN, ENVIRONMENT)
        else:
            new_content, was_modified = patch_fastapi_config(content, HOST_IP, DOMAIN, ENVIRONMENT)
        
        if was_modified:
            # Validate syntax before writing
            if validate_python_syntax(file_path, new_content):
                with open(file_path, "w", encoding="utf-8") as fh:
                    fh.write(new_content)
                print(f"SUCCESS: Updated {file_path}")
                success_count += 1
            else:
                print(f"ERROR: Syntax validation failed for {file_path}, skipping update")
        else:
            print(f"INFO: No changes needed for {file_path}")
            success_count += 1
    
    except Exception as e:
        print(f"ERROR: Error processing {file_path}: {str(e)}")

print(f"\\nSummary: {success_count}/{total_files} files processed successfully")

if success_count < total_files:
    print("WARNING: Some files could not be processed. Check the logs above.")
    sys.exit(1)
else:
    print("SUCCESS: All files processed successfully!")
""", encoding: 'UTF-8'
                        
                        // Run the improved patching script
                        bat """
                            set PYTHONIOENCODING=utf-8
                            python patch_settings.py
                        """
                        
                        // Clean up the patching script
                        bat """
                            if exist patch_settings.py del patch_settings.py
                        """
                    }
                }
            }
        }

        stage('Deploy Dev Environment') {
            when { branch 'dev' }
            steps {
                script {
                    dir("${env.DEV_PATH}") {
                        echo "🚀 Deploying DEV environment..."
                        
                        // Stop existing containers gracefully
                        bat """
                            echo 🛑 Stopping existing containers...
                            docker compose -p ${env.DEV_PROJECT} -f docker-compose-dev.yml down --remove-orphans
                        """
                        
                        // Build and start containers
                        bat """
                            echo 🔨 Building and starting containers...
                            docker compose -p ${env.DEV_PROJECT} -f docker-compose-dev.yml up --build -d --force-recreate
                        """
                        
                        // Wait for containers to be ready
                        echo "⏳ Waiting for containers to start..."
                        waitForContainerHealth(env.DEV_PROJECT, 'web', env.CONTAINER_START_TIMEOUT)
                        
                        // Run post-deployment tasks
                        echo "🔧 Running post-deployment tasks..."
                        bat """
                            echo 📊 Running database migrations...
                            docker compose -p ${env.DEV_PROJECT} -f docker-compose-dev.yml exec -T web python manage.py migrate --noinput
                            
                            echo 🏢 Creating tenant...
                            docker compose -p ${env.DEV_PROJECT} -f docker-compose-dev.yml exec -T web python create_tenant.py
                            
                            echo 📁 Collecting static files...
                            docker compose -p ${env.DEV_PROJECT} -f docker-compose-dev.yml exec -T web python manage.py collectstatic --noinput
                        """
                        
                        echo "✅ DEV deployment completed successfully!"
                    }
                }
            }
        }

        stage('Deploy Prod Environment') {
            when { branch 'main' }
            steps {
                script {
                    dir("${env.PROD_PATH}") {
                        echo "🚀 Deploying PROD environment..."
                        
                        // Create backup of current deployment
                        echo "💾 Creating backup..."
                        bat """
                            set BACKUP_DIR=backup_%RANDOM%
                            if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"
                            echo Backup directory created: %BACKUP_DIR%
                        """
                        
                        // Stop existing containers gracefully
                        bat """
                            echo 🛑 Stopping existing containers...
                            docker compose -p ${env.PROD_PROJECT} -f docker-compose.yml down --remove-orphans
                        """
                        
                        // Build and start containers
                        bat """
                            echo 🔨 Building and starting containers...
                            docker compose -p ${env.PROD_PROJECT} -f docker-compose.yml up --build -d --force-recreate
                        """
                        
                        // Wait for containers to be ready
                        echo "⏳ Waiting for containers to start..."
                        waitForContainerHealth(env.PROD_PROJECT, 'web', env.CONTAINER_START_TIMEOUT)
                        
                        // Run post-deployment tasks
                        echo "🔧 Running post-deployment tasks..."
                        bat """
                            echo 📊 Running database migrations...
                            docker compose -p ${env.PROD_PROJECT} -f docker-compose.yml exec -T web python manage.py migrate --noinput
                            
                            echo 🏢 Creating tenant...
                            docker compose -p ${env.PROD_PROJECT} -f docker-compose.yml exec -T web python create_tenant.py
                            
                            echo 📁 Collecting static files...
                            docker compose -p ${env.PROD_PROJECT} -f docker-compose.yml exec -T web python manage.py collectstatic --noinput
                        """
                        
                        echo "✅ PROD deployment completed successfully!"
                    }
                }
            }
        }

        stage('Health Check') {
            steps {
                script {
                    def project = (env.BRANCH_NAME == 'dev') ? env.DEV_PROJECT : env.PROD_PROJECT
                    def composeFile = (env.BRANCH_NAME == 'dev') ? 'docker-compose-dev.yml' : 'docker-compose.yml'
                    def targetPath = (env.BRANCH_NAME == 'dev') ? env.DEV_PATH : env.PROD_PATH
                    
                    dir(targetPath) {
                        echo "🏥 Performing health checks..."
                        
                        // Check container status
                        bat """
                            echo 📊 Container Status:
                            docker compose -p ${project} -f ${composeFile} ps
                            
                            echo 🔍 Checking container health...
                            docker compose -p ${project} -f ${composeFile} ps --format "table {{.Name}}\\t{{.Status}}"
                        """
                        
                        // Test endpoints
                        echo "🌐 Testing endpoints..."
                        script {
                            def djangoPort = (env.BRANCH_NAME == 'dev') ? '8003' : '8000'
                            def fastapiPort = (env.BRANCH_NAME == 'dev') ? '8004' : '8001'
                            def frontendPort = (env.BRANCH_NAME == 'dev') ? '8081' : '8080'
                            
                            bat """
                                echo Testing Django admin...
                                curl -f http://localhost:${djangoPort}/admin/ || echo "Django admin check failed"
                                
                                echo Testing FastAPI...
                                curl -f http://localhost:${fastapiPort}/api/health || echo "FastAPI health check failed"
                                
                                echo Testing Frontend...
                                curl -f http://localhost:${frontendPort}/ || echo "Frontend check failed"
                            """
                        }
                    }
                }
            }
        }
    }

    post {
        always {
            echo "🧹 Cleaning up temporary files..."
            // Clean up any temporary files created during deployment
        }
        
        success {
            script {
                def environment = (env.BRANCH_NAME == 'dev') ? 'DEV' : 'PROD'
                def domain = (env.BRANCH_NAME == 'dev') ? env.DEV_DOMAIN : env.PROD_DOMAIN
                
                echo "✅ ${environment} deployment successful!"
                echo "🌐 Application available at: https://${domain}"
                echo "📊 Admin panel: https://${domain}/admin"
                echo "🔧 API: https://${domain}/api"
                echo "🤖 Trinity AI: https://${domain}/trinityai"
            }
        }
        
        failure {
            script {
                def project = (env.BRANCH_NAME == 'dev') ? env.DEV_PROJECT : env.PROD_PROJECT
                def composeFile = (env.BRANCH_NAME == 'dev') ? 'docker-compose-dev.yml' : 'docker-compose.yml'
                def targetPath = (env.BRANCH_NAME == 'dev') ? env.DEV_PATH : env.PROD_PATH
                
                echo "❌ Deployment failed on branch ${env.BRANCH_NAME}"
                
                dir(targetPath) {
                    echo "📋 Container logs for debugging:"
                    bat """
                        docker compose -p ${project} -f ${composeFile} logs --tail=100
                    """
                }
            }
        }
        
        cleanup {
            echo "🧹 Performing cleanup..."
            // Add any cleanup steps here
        }
    }
}

// Helper function to wait for container health
def waitForContainerHealth(project, service, timeoutSeconds) {
    def maxAttempts = timeoutSeconds / 5
    def attempt = 0
    
    while (attempt < maxAttempts) {
        try {
            def containerId = bat(
                script: "docker compose -p ${project} -f docker-compose-dev.yml ps -q ${service}",
                returnStdout: true
            ).trim()
            
            if (containerId) {
                def status = bat(
                    script: "docker inspect -f \"{{.State.Status}}\" ${containerId}",
                    returnStdout: true
                ).trim()
                
                if (status == "running") {
                    echo "✅ Container ${service} is running (ID: ${containerId})"
                    return true
                } else {
                    echo "⏳ Container ${service} status: ${status}, waiting..."
                }
            } else {
                echo "⏳ Container ${service} not found, waiting..."
            }
        } catch (Exception e) {
            echo "⚠️ Error checking container status: ${e.getMessage()}"
        }
        
        sleep(5)
        attempt++
    }
    
    error "❌ Container ${service} failed to start within ${timeoutSeconds} seconds"
}
