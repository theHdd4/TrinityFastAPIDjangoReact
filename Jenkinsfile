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
      }
    }
 
    stage('Create Docker Compose Files with Correct HOST_IP') {
      steps {
        echo "🔍 Creating docker-compose files from examples with HOST_IP set to ${env.EXPECTED_HOST_IP}..."
        script {
          // Debug: List all files in workspace
          echo "🐛 DEBUG: Current working directory:"
          bat "cd"
          echo "🐛 DEBUG: Files in workspace root:"
          bat "dir"
          
          // Check if example files exist with detailed output
          echo "🐛 DEBUG: Checking for docker-compose-dev.example.yml..."
          if (fileExists('docker-compose-dev.example.yml')) {
            echo "✅ docker-compose-dev.example.yml found"
          } else {
            echo "❌ docker-compose-dev.example.yml not found"
            bat "dir /s docker-compose-dev.example.yml 2>nul || echo File not found anywhere"
            error "❌ docker-compose-dev.example.yml not found in workspace root"
          }
          
          echo "🐛 DEBUG: Checking for docker-compose.example.yml..."
          if (fileExists('docker-compose.example.yml')) {
            echo "✅ docker-compose.example.yml found"
          } else {
            echo "❌ docker-compose.example.yml not found"
            bat "dir /s docker-compose.example.yml 2>nul || echo File not found anywhere"
            error "❌ docker-compose.example.yml not found in workspace root"
          }
          
          // Create docker-compose-dev.yml from example
          echo "Creating docker-compose-dev.yml from example..."
          def devComposeContent = readFile('docker-compose-dev.example.yml')
          def updatedDevCompose = devComposeContent
         
          // Fixed regex: properly escape the closing brace in character class
          updatedDevCompose = updatedDevCompose.replaceAll(
            'HOST_IP: \\$\\{HOST_IP:-[^}]+\\}',
            "HOST_IP: \${HOST_IP:-${env.EXPECTED_HOST_IP}}"
          )
         
          // Ensure 10.2.1.65:8081 is present in CORS origins
          if (!updatedDevCompose.contains("http://${env.EXPECTED_HOST_IP}:8081")) {
            updatedDevCompose = updatedDevCompose.replaceAll(
              '(CORS_ALLOWED_ORIGINS: "[^"]*)"',
              "\$1,http://${env.EXPECTED_HOST_IP}:8081\""
            )
            updatedDevCompose = updatedDevCompose.replaceAll(
              '(CSRF_TRUSTED_ORIGINS: "[^"]*)"',
              "\$1,http://${env.EXPECTED_HOST_IP}:8081\""
            )
            updatedDevCompose = updatedDevCompose.replaceAll(
              '(FASTAPI_CORS_ORIGINS: "[^"]*)"',
              "\$1,http://${env.EXPECTED_HOST_IP}:8081\""
            )
          }
         
          // Write the updated dev compose file
          writeFile file: 'docker-compose-dev.yml', text: updatedDevCompose
          echo "✅ Created docker-compose-dev.yml with HOST_IP=${env.EXPECTED_HOST_IP}"
         
          // Create docker-compose.yml from example
          echo "Creating docker-compose.yml from example..."
          def prodComposeContent = readFile('docker-compose.example.yml')
          def updatedProdCompose = prodComposeContent
         
          // Fixed regex: properly escape the closing brace in character class
          updatedProdCompose = updatedProdCompose.replaceAll(
            'HOST_IP: \\$\\{HOST_IP:-[^}]+\\}',
            "HOST_IP: \${HOST_IP:-${env.EXPECTED_HOST_IP}}"
          )
         
          // Ensure 10.2.1.65:8080 is present in CORS origins
          if (!updatedProdCompose.contains("http://${env.EXPECTED_HOST_IP}:8080")) {
            updatedProdCompose = updatedProdCompose.replaceAll(
              '(CORS_ALLOWED_ORIGINS: "[^"]*)"',
              "\$1,http://${env.EXPECTED_HOST_IP}:8080\""
            )
            updatedProdCompose = updatedProdCompose.replaceAll(
              '(CSRF_TRUSTED_ORIGINS: "[^"]*)"',
              "\$1,http://${env.EXPECTED_HOST_IP}:8080\""
            )
            updatedProdCompose = updatedProdCompose.replaceAll(
              '(FASTAPI_CORS_ORIGINS: "[^"]*)"',
              "\$1,http://${env.EXPECTED_HOST_IP}:8080\""
            )
          }
         
          // Write the updated prod compose file
          writeFile file: 'docker-compose.yml', text: updatedProdCompose
          echo "✅ Created docker-compose.yml with HOST_IP=${env.EXPECTED_HOST_IP}"
         
          // Check if FastAPI main.py exists before trying to modify it
          if (fileExists('TrinityBackendFastAPI/app/main.py')) {
            echo "Checking TrinityBackendFastAPI/app/main.py..."
            def fastapiContent = readFile('TrinityBackendFastAPI/app/main.py')
            def updatedFastapiContent = fastapiContent
           
            // Only add 10.2.1.65:8080 if it's not already present
            if (!fastapiContent.contains("http://${env.EXPECTED_HOST_IP}:8080")) {
              def originsPattern = ~/origins = os\.getenv\(\s*"FASTAPI_CORS_ORIGINS",\s*"([^"]+)"/
              def originsMatch = fastapiContent =~ originsPattern
              if (originsMatch) {
                def currentOrigins = originsMatch[0][1]
                def newOrigins = currentOrigins + ",http://${env.EXPECTED_HOST_IP}:8080"
                updatedFastapiContent = updatedFastapiContent.replaceAll(
                  ~/origins = os\.getenv\(\s*"FASTAPI_CORS_ORIGINS",\s*"[^"]+"/,
                  "origins = os.getenv(\n    \"FASTAPI_CORS_ORIGINS\",\n    \"${newOrigins}\""
                )
                writeFile file: 'TrinityBackendFastAPI/app/main.py', text: updatedFastapiContent
                echo "🔧 Added ${env.EXPECTED_HOST_IP}:8080 to FastAPI CORS origins"
              } else {
                echo "⚠️ Could not find FASTAPI_CORS_ORIGINS in main.py, skipping update"
              }
            } else {
              echo "✅ FastAPI main.py already contains ${env.EXPECTED_HOST_IP}:8080"
            }
          } else {
            echo "⚠️ TrinityBackendFastAPI/app/main.py not found, skipping FastAPI CORS update"
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
         
          // Start services
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
         
          // Start services
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
      script {
        if (fileExists('docker-compose-dev.yml')) {
          bat "docker compose -p ${env.DEV_PROJECT} -f docker-compose-dev.yml ps || echo Could not get dev service status"
        }
        if (fileExists('docker-compose.yml')) {
          bat "docker compose -p ${env.PROD_PROJECT} -f docker-compose.yml ps || echo Could not get prod service status"
        }
      }
    }
    success {
      echo "✅ Deployment successful on branch ${env.BRANCH_NAME}"
    }
  }
}
