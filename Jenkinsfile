pipeline {
    agent any

    environment {
        DEV_PROJECT = "trinity-dev"
        PROD_PROJECT = "trinity-prod"
        EXPECTED_HOST_IP = "10.2.1.65"

        DEV_PATH = "D:\\application\\dev\\TrinityFastAPIDjangoReact"
        PROD_PATH = "D:\\application\\prod\\TrinityFastAPIDjangoReact"
    }

    stages {

        stage('Checkout Code') {
            steps {
                echo "📦 Checking out branch: ${env.BRANCH_NAME}"
                checkout scm
            }
        }

        stage('Prepare Compose & Env Files') {
            steps {
                script {
                    def targetPath   = (env.BRANCH_NAME == 'dev') ? env.DEV_PATH : env.PROD_PATH
                    def composeExample = (env.BRANCH_NAME == 'dev') ? 'docker-compose-dev.example.yml' : 'docker-compose.example.yml'
                    def composeFinal   = (env.BRANCH_NAME == 'dev') ? 'docker-compose-dev.yml' : 'docker-compose.yml'

                    dir(targetPath) {
                        echo "🔧 Preparing ${composeFinal} with HOST_IP=${env.EXPECTED_HOST_IP}..."

                        // --- Docker Compose ---
                        def composeContent = readFile(composeExample)
                        def updatedCompose = composeContent
                            .replace('${HOST_IP:-localhost}', env.EXPECTED_HOST_IP)
                            .replace('${HOST_IP}', env.EXPECTED_HOST_IP)
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
                                def updated = content
                                    .replace('${HOST_IP:-localhost}', env.EXPECTED_HOST_IP)
                                    .replace('${HOST_IP}', env.EXPECTED_HOST_IP)
                                writeFile file: envFile, text: updated
                                echo "✅ Created ${envFile}"
                            } else {
                                echo "⚠️ Skipping missing file: ${ef}"
                            }
                        }
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

                        docker compose -p ${env.DEV_PROJECT} -f docker-compose-dev.yml down || echo "No stack to remove"

                        docker compose -p ${env.DEV_PROJECT} -f docker-compose-dev.yml up -d --build
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

                        docker compose -p ${env.PROD_PROJECT} -f docker-compose.yml down || echo "No stack to remove"

                        docker compose -p ${env.PROD_PROJECT} -f docker-compose.yml up -d --build
                    """
                }
            }
        }

        stage('Wait for Web Service') {
            steps {
                script {
                    def targetPath   = (env.BRANCH_NAME == 'dev') ? env.DEV_PATH : env.PROD_PATH
                    def composeFinal = (env.BRANCH_NAME == 'dev') ? 'docker-compose-dev.yml' : 'docker-compose.yml'
                    def projectName  = (env.BRANCH_NAME == 'dev') ? env.DEV_PROJECT : env.PROD_PROJECT

                    dir(targetPath) {
                        bat """
                            echo ⏳ Waiting for web service to be available...

                            set /a RETRIES=60
                            :waitloop
                            curl -s http://${env.EXPECTED_HOST_IP}:9001/health >nul 2>&1
                            if %ERRORLEVEL%==0 (
                                echo ✅ Web service is up!
                                goto :ready
                            )
                            set /a RETRIES-=1
                            if %RETRIES% gtr 0 (
                                timeout /t 5 >nul
                                goto :waitloop
                            )
                            echo ❌ Web service did not become ready in time.
                            exit /b 1

                            :ready
                        """
                    }
                }
            }
        }

        stage('Run Tenant Creation Script') {
            steps {
                script {
                    def targetPath   = (env.BRANCH_NAME == 'dev') ? env.DEV_PATH : env.PROD_PATH
                    def composeFinal = (env.BRANCH_NAME == 'dev') ? 'docker-compose-dev.yml' : 'docker-compose.yml'
                    def projectName  = (env.BRANCH_NAME == 'dev') ? env.DEV_PROJECT : env.PROD_PROJECT

                    dir(targetPath) {
                        bat """
                            echo 🔧 Running tenant creation script...
                            docker compose -p ${projectName} -f ${composeFinal} exec web python create_tenant.py
                        """
                    }
                }
            }
        }
    }

    post {
        failure { echo "❌ Deployment failed on branch ${env.BRANCH_NAME}" }
        success { echo "✅ Deployment successful on branch ${env.BRANCH_NAME}" }
    }
}
