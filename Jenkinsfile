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
 
    stage('Create Docker Compose Files') {
      steps {
        echo "🔍 Creating docker-compose files with HOST_IP set to ${env.EXPECTED_HOST_IP}..."
        script {
          // Create docker-compose-dev.yml from example
          echo "Creating docker-compose-dev.yml from example..."
          def devComposeContent = readFile('docker-compose-dev.example.yml')
          def updatedDevCompose = devComposeContent.replace('${HOST_IP:-localhost}', env.EXPECTED_HOST_IP)
          writeFile file: 'docker-compose-dev.yml', text: updatedDevCompose
          echo "✅ Created docker-compose-dev.yml"
         
          // Create docker-compose.yml from example
          echo "Creating docker-compose.yml from example..."
          def prodComposeContent = readFile('docker-compose.example.yml')
          def updatedProdCompose = prodComposeContent.replace('${HOST_IP:-localhost}', env.EXPECTED_HOST_IP)
          writeFile file: 'docker-compose.yml', text: updatedProdCompose
          echo "✅ Created docker-compose.yml"
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
          env.HOST_IP = env.EXPECTED_HOST_IP
          echo "🔧 Setting HOST_IP to: ${env.HOST_IP}"
         
          bat """
            set HOST_IP=${env.HOST_IP}
            docker compose -p ${env.DEV_PROJECT} -f docker-compose-dev.yml down
            docker compose -p ${env.DEV_PROJECT} -f docker-compose-dev.yml up --build -d
          """
         
          echo "⏳ Waiting for services to be ready..."
          bat "timeout /t 30"
          
          echo "📊 Checking service status..."
          bat "docker compose -p ${env.DEV_PROJECT} -f docker-compose-dev.yml ps"
         
          echo "🔧 Running tenant creation script..."
          bat "docker compose -p ${env.DEV_PROJECT} -f docker-compose-dev.yml exec web python create_tenant.py"
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
          env.HOST_IP = env.EXPECTED_HOST_IP
          echo "🔧 Setting HOST_IP to: ${env.HOST_IP}"
         
          bat """
            set HOST_IP=${env.HOST_IP}
            docker compose -p ${env.PROD_PROJECT} -f docker-compose.yml down
            docker compose -p ${env.PROD_PROJECT} -f docker-compose.yml up --build -d
          """
         
          echo "⏳ Waiting for services to be ready..."
          bat "timeout /t 30"
          
          echo "📊 Checking service status..."
          bat "docker compose -p ${env.PROD_PROJECT} -f docker-compose.yml ps"
         
          echo "🔧 Running tenant creation script..."
          bat "docker compose -p ${env.PROD_PROJECT} -f docker-compose.yml exec web python create_tenant.py"
        }
      }
    }
  }
 
  post {
    failure {
      echo "❌ Deployment failed on branch ${env.BRANCH_NAME}"
    }
    success {
      echo "✅ Deployment successful on branch ${env.BRANCH_NAME}"
    }
  }
}
