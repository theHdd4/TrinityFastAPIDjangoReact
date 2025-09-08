pipeline {
    agent any

    environment {
        DEV_PROJECT     = 'trinity-dev'
        PROD_PROJECT    = 'trinity-prod'
        EXPECTED_HOST_IP = '10.2.1.65'
        DEV_HEALTH_URL  = 'http://10.2.1.65:9001/health'
        PROD_HEALTH_URL = 'http://10.2.1.65:9201/health'
    }

    stages {
        stage('Checkout Code') {
            steps {
                script {
                    echo "📦 Checking out code for branch: ${env.BRANCH_NAME}"
                    // Code is automatically checked out by Jenkins
                    echo "✅ Code checked out to workspace: ${env.WORKSPACE}"
                }
            }
        }

        stage('Prepare Configuration Files') {
            steps {
                script {
                    dir("${env.WORKSPACE}") {
                        echo "🔧 Converting .example files to actual configuration files..."
                        
                        // Determine which files to use based on branch
                        def composeExample = (env.BRANCH_NAME == 'dev') ? 'docker-compose-dev.example.yml' : 'docker-compose.example.yml'
                        def composeFinal   = (env.BRANCH_NAME == 'dev') ? 'docker-compose-dev.yml'       : 'docker-compose.yml'

                        // Convert docker-compose example to actual file
                        if (fileExists(composeExample)) {
                            def composeContent = readFile(composeExample)
                            def updatedCompose = composeContent
                                .replace('${HOST_IP:-localhost}', env.EXPECTED_HOST_IP)
                                .replace('${HOST_IP}', env.EXPECTED_HOST_IP)
                            writeFile file: composeFinal, text: updatedCompose
                            echo "✅ Created ${composeFinal} with HOST_IP=${env.EXPECTED_HOST_IP}"
                        } else {
                            error "❌ ${composeExample} not found!"
                        }

                        // Convert .env.example files to .env files
                        def envFiles = [
                            "TrinityBackendDjango/.env.example",
                            "TrinityFrontend/.env.example"
                        ]
                        
                        for (envExample in envFiles) {
                            def envFinal = envExample.replace(".env.example", ".env")
                            if (fileExists(envExample)) {
                                def envContent = readFile(envExample)
                                def updatedEnv = envContent
                                    .replace('${HOST_IP:-localhost}', env.EXPECTED_HOST_IP)
                                    .replace('${HOST_IP}', env.EXPECTED_HOST_IP)
                                writeFile file: envFinal, text: updatedEnv
                                echo "✅ Created ${envFinal}"
                            } else {
                                echo "⚠️ Warning: ${envExample} not found, skipping..."
                            }
                        }
                    }
                }
            }
        }

        stage('Deploy Development') {
            when { branch 'dev' }
            steps {
                script {
                    dir("${env.WORKSPACE}") {
                        echo "🚀 Deploying Development Environment..."
                        
                        // Stop existing stack if running, then start with new code
                        powershell """
                            Write-Host "Checking if Docker Compose stack is running..."
                            try {
                                \$existing = docker compose -p ${env.DEV_PROJECT} ps -q
                                if (\$existing) {
                                    Write-Host "📦 Stopping existing stack..."
                                    docker compose -p ${env.DEV_PROJECT} -f docker-compose-dev.yml down
                                    Write-Host "✅ Existing stack stopped"
                                } else {
                                    Write-Host "📦 No existing stack found"
                                }
                            } catch {
                                Write-Host "📦 No existing stack to stop"
                            }
                            
                            Write-Host "🏗️ Starting Docker Compose with updated code..."
                            docker compose -p ${env.DEV_PROJECT} -f docker-compose-dev.yml up --build -d --force-recreate
                            Write-Host "✅ Docker Compose stack started"
                        """
                        
                        // Wait for web service - Check every 1 minute, 5 times (5 minutes total)
                        waitForWebService(env.DEV_HEALTH_URL, 5, 60)
                        
                        // Execute tenant creation script
                        powershell """
                            Write-Host "🔧 Running tenant creation script..."
                            docker compose -p ${env.DEV_PROJECT} -f docker-compose-dev.yml exec web python create_tenant.py
                            Write-Host "✅ Tenant creation completed"
                        """
                    }
                }
            }
        }

        stage('Deploy Production') {
            when { branch 'main' }
            steps {
                script {
                    dir("${env.WORKSPACE}") {
                        echo "🚀 Deploying Production Environment..."
                        
                        // Stop existing stack if running, then start with new code
                        powershell """
                            Write-Host "Checking if Docker Compose stack is running..."
                            try {
                                \$existing = docker compose -p ${env.PROD_PROJECT} ps -q
                                if (\$existing) {
                                    Write-Host "📦 Stopping existing stack..."
                                    docker compose -p ${env.PROD_PROJECT} -f docker-compose.yml down
                                    Write-Host "✅ Existing stack stopped"
                                } else {
                                    Write-Host "📦 No existing stack found"
                                }
                            } catch {
                                Write-Host "📦 No existing stack to stop"
                            }
                            
                            Write-Host "🏗️ Starting Docker Compose with updated code..."
                            docker compose -p ${env.PROD_PROJECT} -f docker-compose.yml up --build -d --force-recreate
                            Write-Host "✅ Docker Compose stack started"
                        """
                        
                        // Wait for web service - Check every 1 minute, 5 times (5 minutes total)
                        waitForWebService(env.PROD_HEALTH_URL, 5, 60)
                        
                        // Execute tenant creation script
                        powershell """
                            Write-Host "🔧 Running tenant creation script..."
                            docker compose -p ${env.PROD_PROJECT} -f docker-compose.yml exec web python create_tenant.py
                            Write-Host "✅ Tenant creation completed"
                        """
                    }
                }
            }
        }
    }

    post {
        always {
            echo "🔍 Pipeline completed for branch: ${env.BRANCH_NAME}"
        }
        success { 
            echo "✅ Deployment successful for branch: ${env.BRANCH_NAME}" 
        }
        failure { 
            echo "❌ Deployment failed for branch: ${env.BRANCH_NAME}"
            echo "🔧 Check the logs above for details"
        }
    }
}

/**
 * Wait for web service to become healthy
 * @param healthUrl - The health check URL
 * @param maxAttempts - Number of attempts (5)
 * @param intervalSeconds - Seconds between attempts (60 = 1 minute)
 */
def waitForWebService(String healthUrl, int maxAttempts, int intervalSeconds) {
    echo "⏳ Waiting for web service to become healthy..."
    echo "🔍 Health URL: ${healthUrl}"
    echo "⏰ Will check every ${intervalSeconds} seconds for ${maxAttempts} attempts (${maxAttempts * intervalSeconds / 60} minutes total)"
    
    for (int attempt = 1; attempt <= maxAttempts; attempt++) {
        echo "🔄 Health check attempt ${attempt}/${maxAttempts}..."
        
        try {
            def result = powershell(
                script: """
                    try {
                        \$response = Invoke-WebRequest -Uri "${healthUrl}" -TimeoutSec 10 -UseBasicParsing
                        if (\$response.StatusCode -eq 200) {
                            Write-Host "SUCCESS"
                            exit 0
                        } else {
                            Write-Host "FAILED - Status: \$(\$response.StatusCode)"
                            exit 1
                        }
                    } catch {
                        Write-Host "FAILED - Error: \$(\$_.Exception.Message)"
                        exit 1
                    }
                """,
                returnStatus: true
            )
            
            if (result == 0) {
                echo "✅ Web service is healthy!"
                return
            }
        } catch (Exception e) {
            echo "❌ Health check failed: ${e.getMessage()}"
        }
        
        if (attempt < maxAttempts) {
            echo "⏳ Web service not ready yet. Waiting ${intervalSeconds} seconds before next attempt..."
            sleep(intervalSeconds)
        }
    }
    
    // If we reach here, all attempts failed
    error "❌ Web service did not become healthy after ${maxAttempts} attempts (${maxAttempts * intervalSeconds / 60} minutes). Deployment failed!"
}
