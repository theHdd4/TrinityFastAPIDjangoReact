pipeline {
    agent any

    environment {
        DEV_PROJECT      = 'trinity-dev'
        PROD_PROJECT     = 'trinity-prod'
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

                        // Select docker-compose template based on branch
                        def composeExample = (env.BRANCH_NAME == 'dev') ? 'docker-compose-dev.example.yml' : 'docker-compose.example.yml'
                        def composeFinal   = (env.BRANCH_NAME == 'dev') ? 'docker-compose-dev.yml'       : 'docker-compose.yml'

                        // Convert docker-compose example → actual file
                        if (fileExists(composeExample)) {
                            def composeContent = readFile(composeExample)
                            def updatedCompose = composeContent
                                // Replace template defaults
                                .replaceAll(/\$\{HOST_IP:-[^}]+\}/, "\${HOST_IP:-${env.EXPECTED_HOST_IP}}")
                                .replaceAll(/\$\{OLLAMA_IP:-[^}]+\}/, "\${OLLAMA_IP:-${env.EXPECTED_HOST_IP}}")
                                // Replace plain placeholders
                                .replace('${HOST_IP}', env.EXPECTED_HOST_IP)
                                .replace('${OLLAMA_IP}', env.EXPECTED_HOST_IP)

                            writeFile file: composeFinal, text: updatedCompose
                            echo "✅ Created ${composeFinal} with corrected IP defaults"
                        } else {
                            error "❌ ${composeExample} not found!"
                        }

                        // Convert .env.example → .env
                        def envFiles = [
                            "TrinityBackendDjango/.env.example",
                            "TrinityFrontend/.env.example"
                        ]

                        for (envExample in envFiles) {
                            def envFinal = envExample.replace(".env.example", ".env")
                            if (fileExists(envExample)) {
                                def envContent = readFile(envExample)
                                def updatedEnv = envContent
                                    // Replace template defaults
                                    .replaceAll(/\$\{HOST_IP:-[^}]+\}/, env.EXPECTED_HOST_IP)
                                    .replaceAll(/\$\{OLLAMA_IP:-[^}]+\}/, env.EXPECTED_HOST_IP)
                                    .replace('${HOST_IP}', env.EXPECTED_HOST_IP)
                                    .replace('${OLLAMA_IP}', env.EXPECTED_HOST_IP)
                                    // Fix specific variable assignments (multiline regex)
                                    .replaceAll(/(?m)^HOST_IP\s*=\s*.*$/, "HOST_IP=${env.EXPECTED_HOST_IP}")
                                    .replaceAll(/(?m)^VITE_HOST_IP\s*=\s*.*$/, "VITE_HOST_IP=${env.EXPECTED_HOST_IP}")
                                    .replaceAll(/(?m)^OLLAMA_IP\s*=\s*.*$/, "OLLAMA_IP=${env.EXPECTED_HOST_IP}")
                                    // Replace ${HOST_IP} references (no /g in Groovy — replaceAll handles global)
                                    .replaceAll(/\$\{HOST_IP\}/, env.EXPECTED_HOST_IP)

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

                        echo "⏳ Waiting 2 minutes for services to be ready..."
                        sleep(120)
                        echo "✅ Wait completed!"

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

                        echo "⏳ Waiting 2 minutes for services to be ready..."
                        sleep(120)
                        echo "✅ Wait completed!"

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
