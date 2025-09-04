pipeline {
  agent any

  environment {
    DEV_PROJECT = 'trinity-dev'
    PROD_PROJECT = 'trinity-prod'
    EXPECTED_HOST_IP = '10.2.1.65'
  }

  stages {
    stage('Checkout Code') {
      steps {
        echo "📦 Checking out branch: ${env.BRANCH_NAME}"
        checkout scm
        // Removed cleanWs() to preserve volumes
      }
    }

    stage('Create Docker Compose Files with Correct HOST_IP') {
      steps {
        echo "🔍 Creating docker-compose files from examples with HOST_IP set to ${env.EXPECTED_HOST_IP}..."
        script {
          // Create docker-compose-dev.yml from example
          echo "Creating docker-compose-dev.yml from example..."
          def devComposeContent = readFile('docker-compose-dev.example.yml')
          def updatedDevCompose = devComposeContent
          
          // Override HOST_IP default to 10.2.1.65
          updatedDevCompose = updatedDevCompose.replaceAll(
            'HOST_IP: \\${HOST_IP:-[^}]+\\}',
            "HOST_IP: \${HOST_IP:-${env.EXPECTED_HOST_IP}}"
          )
          
          // Ensure 10.2.1.65:8081 is present in CORS origins (preserve other important IPs)
          if (!updatedDevCompose.contains("http://${env.EXPECTED_HOST_IP}:8081")) {
            // Add 10.2.1.65:8081 to CORS origins while preserving existing ones
            updatedDevCompose = updatedDevCompose.replaceAll(
              '(CORS_ALLOWED_ORIGINS: "[^"]+)\"',
              '$1,http://${env.EXPECTED_HOST_IP}:8081"'
            )
            updatedDevCompose = updatedDevCompose.replaceAll(
              '(CSRF_TRUSTED_ORIGINS: "[^"]+)\"',
              '$1,http://${env.EXPECTED_HOST_IP}:8081"'
            )
            updatedDevCompose = updatedDevCompose.replaceAll(
              '(FASTAPI_CORS_ORIGINS: "[^"]+)\"',
              '$1,http://${env.EXPECTED_HOST_IP}:8081"'
            )
          }
          
          // Write the updated dev compose file
          writeFile file: 'docker-compose-dev.yml', text: updatedDevCompose
          echo "✅ Created docker-compose-dev.yml with HOST_IP=${env.EXPECTED_HOST_IP}"
          
          // Create docker-compose.yml from example
          echo "Creating docker-compose.yml from example..."
          def prodComposeContent = readFile('docker-compose.example.yml')
          def updatedProdCompose = prodComposeContent
          
          // Override HOST_IP default to 10.2.1.65
          updatedProdCompose = updatedProdCompose.replaceAll(
            'HOST_IP: \\${HOST_IP:-[^}]+\\}',
            "HOST_IP: \${HOST_IP:-${env.EXPECTED_HOST_IP}}"
          )
          
          // Ensure 10.2.1.65:8080 is present in CORS origins (preserve other important IPs)
          if (!updatedProdCompose.contains("http://${env.EXPECTED_HOST_IP}:8080")) {
            // Add 10.2.1.65:8080 to CORS origins while preserving existing ones
            updatedProdCompose = updatedProdCompose.replaceAll(
              '(CORS_ALLOWED_ORIGINS: "[^"]+)\"',
              '$1,http://${env.EXPECTED_HOST_IP}:8080"'
            )
            updatedProdCompose = updatedProdCompose.replaceAll(
              '(CSRF_TRUSTED_ORIGINS: "[^"]+)\"',
              '$1,http://${env.EXPECTED_HOST_IP}:8080"'
            )
            updatedProdCompose = updatedProdCompose.replaceAll(
              '(FASTAPI_CORS_ORIGINS: "[^"]+)\"',
              '$1,http://${env.EXPECTED_HOST_IP}:8080"'
            )
          }
          
          // Write the updated prod compose file
          writeFile file: 'docker-compose.yml', text: updatedProdCompose
          echo "✅ Created docker-compose.yml with HOST_IP=${env.EXPECTED_HOST_IP}"
          
          // Check and fix FastAPI main.py
          echo "Checking TrinityBackendFastAPI/app/main.py..."
          def fastapiContent = readFile('TrinityBackendFastAPI/app/main.py')
          def updatedFastapiContent = fastapiContent
          
          // Only add 10.2.1.65:8080 if it's not already present, preserve other IPs
          if (!fastapiContent.contains("http://${env.EXPECTED_HOST_IP}:8080")) {
            // Extract the current origins string and add our IP
            def originsMatch = fastapiContent =~ 'origins = os\\.getenv\\(\\s*"FASTAPI_CORS_ORIGINS",\\s*"([^"]+)"'
            if (originsMatch) {
              def currentOrigins = originsMatch[0][1]
              def newOrigins = currentOrigins + ",http://${env.EXPECTED_HOST_IP}:8080"
              updatedFastapiContent = updatedFastapiContent.replaceAll(
                'origins = os\\.getenv\\(\\s*"FASTAPI_CORS_ORIGINS",\\s*"[^"]+"',
                "origins = os.getenv(\n    \"FASTAPI_CORS_ORIGINS\",\n    \"${newOrigins}\""
              )
              writeFile file: 'TrinityBackendFastAPI/app/main.py', text: updatedFastapiContent
              echo "🔧 Added ${env.EXPECTED_HOST_IP}:8080 to FastAPI CORS origins (preserved existing IPs)"
            } else {
              echo "⚠️ Could not find FASTAPI_CORS_ORIGINS in main.py, skipping update"
            }
          } else {
            echo "✅ FastAPI main.py already contains ${env.EXPECTED_HOST_IP}:8080"
          }
          
          echo "🎯 All docker-compose files created with HOST_IP=${env.EXPECTED_HOST_IP}"
        }
      }
    }

    stage('Deploy Dev Environment') {
      when {
        branch 'dev'
      }
      steps {
        echo "🚀 Deploying DEV environment..."
        script {
          // Set HOST_IP for dev environment
          env.HOST_IP = env.EXPECTED_HOST_IP
          echo "🔧 Setting HOST_IP to: ${env.HOST_IP}"
          
          // Start services (volumes persist)
          bat """
            set HOST_IP=${env.HOST_IP}
            docker compose -p ${env.DEV_PROJECT} -f docker-compose-dev.yml down || exit 0
            docker compose -p ${env.DEV_PROJECT} -f docker-compose-dev.yml up --build -d
          """
          
          // Wait for services to be healthy
          echo "⏳ Waiting for services to be ready..."
          bat """
            timeout /t 30
            docker compose -p ${env.DEV_PROJECT} -f docker-compose-dev.yml ps
          """
          
          // Check if web service is running
          bat """
            docker compose -p ${env.DEV_PROJECT} -f docker-compose-dev.yml exec web python -c "import sys; print('Web service is ready')" || exit 1
          """
          
          // Execute tenant script
          echo "🔧 Running tenant creation script..."
          bat """
            docker compose -p ${env.DEV_PROJECT} -f docker-compose-dev.yml exec web python create_tenant.py
          """
          
          // Verify HOST_IP is correctly applied
          echo "🔍 Verifying HOST_IP configuration in running containers..."
          bat """
            docker compose -p ${env.DEV_PROJECT} -f docker-compose-dev.yml exec web printenv HOST_IP
            docker compose -p ${env.DEV_PROJECT} -f docker-compose-dev.yml exec fastapi printenv HOST_IP
          """
        }
      }
    }

    stage('Deploy Prod Environment') {
      when {
        branch 'main'
      }
      steps {
        echo "🚀 Deploying PROD environment..."
        script {
          // Set HOST_IP for prod environment
          env.HOST_IP = env.EXPECTED_HOST_IP
          echo "🔧 Setting HOST_IP to: ${env.HOST_IP}"
          
          // Start services (volumes persist)
          bat """
            set HOST_IP=${env.HOST_IP}
            docker compose -p ${env.PROD_PROJECT} -f docker-compose.yml down || exit 0
            docker compose -p ${env.PROD_PROJECT} -f docker-compose.yml up --build -d
          """
          
          // Wait for services to be healthy
          echo "⏳ Waiting for services to be ready..."
          bat """
            timeout /t 30
            docker compose -p ${env.PROD_PROJECT} -f docker-compose.yml ps
          """
          
          // Check if web service is running
          bat """
            docker compose -p ${env.PROD_PROJECT} -f docker-compose.yml exec web python -c "import sys; print('Web service is ready')" || exit 1
          """
          
          // Execute tenant script
          echo "🔧 Running tenant creation script..."
          bat """
            docker compose -p ${env.PROD_PROJECT} -f docker-compose.yml exec web python create_tenant.py
          """
          
          // Verify HOST_IP is correctly applied
          echo "🔍 Verifying HOST_IP configuration in running containers..."
          bat """
            docker compose -p ${env.PROD_PROJECT} -f docker-compose.yml exec web printenv HOST_IP
            docker compose -p ${env.PROD_PROJECT} -f docker-compose.yml exec fastapi printenv HOST_IP
          """
        }
      }
    }

  }

  post {
    failure {
      echo "❌ Deployment failed on branch ${env.BRANCH_NAME}"
      // Show service status for debugging
      bat "docker compose -p ${env.DEV_PROJECT} -f docker-compose-dev.yml ps || docker compose -p ${env.PROD_PROJECT} -f docker-compose.yml ps"
    }
    success {
      echo "✅ Deployment successful on branch ${env.BRANCH_NAME}"
    }
  }
}