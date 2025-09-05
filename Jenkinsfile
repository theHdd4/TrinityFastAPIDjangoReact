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
    "config/settings.py",   # Django
    "app/config.py",        # FastAPI (adjust if needed)
]

host_ip = "${env.EXPECTED_HOST_IP}"

for f in FILES:
    if not os.path.exists(f):
        continue
    with open(f, "r+", encoding="utf-8") as fh:
        content = fh.read()
        if host_ip in content:
            print(f"✅ {host_ip} already present in {f}")
        else:
            print(f"➕ Adding {host_ip} to {f}")
            content = content.replace("]", f", '{host_ip}']")
            fh.seek(0); fh.write(content); fh.truncate()
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

                        echo ⏳ Waiting for web container to be healthy...
                        set RETRIES=30
                        :waitloop
                        for /f %%i in ('docker compose -p ${env.DEV_PROJECT} -f docker-compose-dev.yml ps -q web') do (
                            for /f %%s in ('docker inspect -f "{{.State.Health.Status}}" %%i') do (
                                if "%%s"=="healthy" (
                                    echo ✅ Web container is healthy!
                                    goto :ready
                                )
                            )
                        )
                        set /a RETRIES-=1
                        if %RETRIES% gtr 0 (
                            timeout /t 5 >nul
                            goto :waitloop
                        )
                        echo ❌ Web container did not become healthy in time.
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
                dir("${env.PROD_PATH}") {
                    bat """
                        echo 🚀 Deploying PROD environment...
                        docker compose -p ${env.PROD_PROJECT} -f docker-compose.yml down
                        docker compose -p ${env.PROD_PROJECT} -f docker-compose.yml up --build -d --force-recreate

                        echo ⏳ Waiting for web container to be healthy...
                        set RETRIES=30
                        :waitloop
                        for /f %%i in ('docker compose -p ${env.PROD_PROJECT} -f docker-compose.yml ps -q web') do (
                            for /f %%s in ('docker inspect -f "{{.State.Health.Status}}" %%i') do (
                                if "%%s"=="healthy" (
                                    echo ✅ Web container is healthy!
                                    goto :ready
                                )
                            )
                        )
                        set /a RETRIES-=1
                        if %RETRIES% gtr 0 (
                            timeout /t 5 >nul
                            goto :waitloop
                        )
                        echo ❌ Web container did not become healthy in time.
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
