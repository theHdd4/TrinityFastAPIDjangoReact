pipeline {
    agent any

    environment {
        DEV_PROJECT     = 'trinity-dev'
        PROD_PROJECT    = 'trinity-prod'
        EXPECTED_HOST_IP = '10.2.1.65'
    }

    stages {
        stage('Checkout Code') {
            steps {
                script {
                    echo "📦 Code is already checked out into Jenkins workspace: ${env.WORKSPACE}"
                    echo "Branch: ${env.BRANCH_NAME}"
                }
            }
        }

        stage('Prepare Compose & Env Files') {
            steps {
                script {
                    def composeExample = (env.BRANCH_NAME == 'dev') ? 'docker-compose-dev.example.yml' : 'docker-compose.example.yml'
                    def composeFinal   = (env.BRANCH_NAME == 'dev') ? 'docker-compose-dev.yml'       : 'docker-compose.yml'

                    dir("${env.WORKSPACE}") {
                        echo "🔍 Preparing ${composeFinal} with HOST_IP=${env.EXPECTED_HOST_IP}..."

                        // Docker Compose
                        def composeContent = readFile(composeExample)
                        def updatedCompose = composeContent
                            .replace('${HOST_IP:-localhost}', env.EXPECTED_HOST_IP)
                            .replace('${HOST_IP}', env.EXPECTED_HOST_IP)
                        writeFile file: composeFinal, text: updatedCompose
                        echo "✅ Created ${composeFinal}"

                        // .env files
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
                dir("${env.WORKSPACE}") {
                    bat """
                        echo 🚀 Deploying DEV environment...

                        docker compose -p ${env.DEV_PROJECT} -f docker-compose-dev.yml down || echo "No existing stack"
                        docker compose -p ${env.DEV_PROJECT} -f docker-compose-dev.yml up --build -d --force-recreate

                        echo ⏳ Waiting up to 5 minutes for web service...

                        set RETRIES=60
                        :waitloop
                        curl -s http://10.2.1.65:9001/health >nul 2>&1
                        if %ERRORLEVEL%==0 (
                            echo ✅ Web service is UP!
                            goto :ready
                        )
                        set /a RETRIES-=1
                        if %RETRIES% GTR 0 (
                            ping -n 6 127.0.0.1 >nul
                            goto :waitloop
                        )
                        echo ❌ Web service did not become healthy in time.
                        exit /b 1

                        :ready
                        echo 🔧 Running tenant creation script...
                        docker compose -p ${env.DEV_PROJECT} -f docker-compose-dev.yml exec web python create_tenant.py
                    """
                }
            }
        }

        stage('Deploy Prod Environment') {
            when { branch 'main' }
            steps {
                dir("${env.WORKSPACE}") {
                    bat """
                        echo 🚀 Deploying PROD environment...

                        docker compose -p ${env.PROD_PROJECT} -f docker-compose.yml down || echo "No existing stack"
                        docker compose -p ${env.PROD_PROJECT} -f docker-compose.yml up --build -d --force-recreate

                        echo ⏳ Waiting up to 5 minutes for web service...

                        set RETRIES=60
                        :waitloop
                        curl -s http://10.2.1.65:9201/health >nul 2>&1
                        if %ERRORLEVEL%==0 (
                            echo ✅ Web service is UP!
                            goto :ready
                        )
                        set /a RETRIES-=1
                        if %RETRIES% GTR 0 (
                            ping -n 6 127.0.0.1 >nul
                            goto :waitloop
                        )
                        echo ❌ Web service did not become healthy in time.
                        exit /b 1

                        :ready
                        echo 🔧 Running tenant creation script...
                        docker compose -p ${env.PROD_PROJECT} -f docker-compose.yml exec web python create_tenant.py
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
