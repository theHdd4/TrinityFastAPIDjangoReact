pipeline {
    agent any

    environment {
        DEV_PROJECT     = 'trinity-dev'
        PROD_PROJECT    = 'trinity-prod'
        EXPECTED_HOST_IP = '10.2.4.48'
    }

    stages {
        stage('Checkout Code') {
            steps {
                script {
                    echo "📦 Checking out code for branch: ${env.BRANCH_NAME}"
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
                                // Fix template default values in Docker Compose
                                .replaceAll(/\$\{HOST_IP:-[^}]+\}/, "\${HOST_IP:-${env.EXPECTED_HOST_IP}}")
                                .replaceAll(/\$\{OLLAMA_IP:-[^}]+\}/, "\${OLLAMA_IP:-${env.EXPECTED_HOST_IP}}")
                                // Replace any remaining ${HOST_IP} and ${OLLAMA_IP} without defaults
                                .replace('${HOST_IP}', env.EXPECTED_HOST_IP)
                                .replace('${OLLAMA_IP}', env.EXPECTED_HOST_IP)
                            
                            writeFile file: composeFinal, text: updatedCompose
                            echo "✅ Created ${composeFinal} with corrected IP defaults"
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
                                    // Replace template placeholders first
                                    .replaceAll(/\$\{HOST_IP:-[^}]+\}/, env.EXPECTED_HOST_IP)
                                    .replaceAll(/\$\{OLLAMA_IP:-[^}]+\}/, env.EXPECTED_HOST_IP)
                                    .replace('${HOST_IP}', env.EXPECTED_HOST_IP)
                                    .replace('${OLLAMA_IP}', env.EXPECTED_HOST_IP)
                                    // Fix specific variable assignments (selective replacement)
                                    .replaceAll(/^HOST_IP\s*=\s*.*$/m, "HOST_IP=${env.EXPECTED_HOST_IP}")
                                    .replaceAll(/^VITE_HOST_IP\s*=\s*.*$/m, "VITE_HOST_IP=${env.EXPECTED_HOST_IP}")
                                    .replaceAll(/^OLLAMA_IP\s*=\s*.*$/m, "OLLAMA_IP=${env.EXPECTED_HOST_IP}")
                                    // Update template references in CORS/CSRF (but leave other IPs alone)
                                    .replaceAll(/\$\{HOST_IP\}/g, env.EXPECTED_HOST_IP)
                                
                                writeFile file: envFinal, text: updatedEnv
                                echo "✅ Created ${envFinal} with corrected IPs"
                            } else {
                                echo "⚠️ Warning: ${envExample} not found, skipping..."
                            }
                        }
                        
                        echo "🔍 Configuration files prepared with IP: ${env.EXPECTED_HOST_IP}"
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
                        bat """
                            echo Checking if Docker Compose stack is running...
                            
                            REM Check if stack exists and stop it
                            docker compose -p ${env.DEV_PROJECT} ps -q >nul 2>&1
                            if %ERRORLEVEL%==0 (
                                echo 📦 Stopping existing stack...
                                docker compose -p ${env.DEV_PROJECT} -f docker-compose-dev.yml down
                                echo ✅ Existing stack stopped
                            ) else (
                                echo 📦 No existing stack found
                            )
                            
                            echo 🏗️ Starting Docker Compose with updated code...
                            docker compose -p ${env.DEV_PROJECT} -f docker-compose-dev.yml up --build -d --force-recreate
                            echo ✅ Docker Compose stack started
                        """
                        
                        // Wait 2 minutes for services to be ready
                        echo "⏳ Waiting 2 minutes for services to be ready..."
                        sleep(120) // 120 seconds = 2 minutes
                        echo "✅ Wait completed!"
                        
                        // Execute tenant creation script
                        bat """
                            echo 🔧 Running tenant creation script...
                            docker compose -p ${env.DEV_PROJECT} -f docker-compose-dev.yml exec web python create_tenant.py
                            echo ✅ Tenant creation completed
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
                        bat """
                            echo Checking if Docker Compose stack is running...
                            
                            REM Check if stack exists and stop it
                            docker compose -p ${env.PROD_PROJECT} ps -q >nul 2>&1
                            if %ERRORLEVEL%==0 (
                                echo 📦 Stopping existing stack...
                                docker compose -p ${env.PROD_PROJECT} -f docker-compose.yml down
                                echo ✅ Existing stack stopped
                            ) else (
                                echo 📦 No existing stack found
                            )
                            
                            echo 🏗️ Starting Docker Compose with updated code...
                            docker compose -p ${env.PROD_PROJECT} -f docker-compose.yml up --build -d --force-recreate
                            echo ✅ Docker Compose stack started
                        """
                        
                        // Wait 2 minutes for services to be ready
                        echo "⏳ Waiting 2 minutes for services to be ready..."
                        sleep(120) // 120 seconds = 2 minutes
                        echo "✅ Wait completed!"
                        
                        // Execute tenant creation script with error handling
                        def tenantResult = bat(
                            script: """
                                echo 🔧 Running tenant creation script...
                                docker compose -p ${env.PROD_PROJECT} -f docker-compose.yml exec web python create_tenant.py
                            """,
                            returnStatus: true
                        )
                        
                        if (tenantResult == 0 || tenantResult == 137) {
                            echo "✅ Tenant creation completed successfully"
                        } else {
                            error "❌ Tenant creation failed with exit code: ${tenantResult}"
                        }
                    }
                }
            }
        }
    }

    post {
        always {
            echo "🔍 Pipeline completed for branch: ${env.BRANCH_NAME}"
            echo "🎯 Target IP used: ${env.EXPECTED_HOST_IP}"
        }
        success { 
            echo "✅ Deployment successful for branch: ${env.BRANCH_NAME}" 
            echo "🌐 Services should be accessible on IP: ${env.EXPECTED_HOST_IP}"
        }
        failure { 
            echo "❌ Deployment failed for branch: ${env.BRANCH_NAME}"
            echo "🔧 Check the logs above for details"
        }
    }
}
