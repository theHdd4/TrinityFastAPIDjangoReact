pipeline {
  agent any

  environment {
    DEV_DIR = 'C:\\Users\\QuantMatrix AI\\Desktop\\Trinity\\dev\\TrinityFastAPIDjangoReact'
    PROD_DIR = 'C:\\Users\\QuantMatrix AI\\Desktop\\Trinity\\Prod\\TrinityFastAPIDjangoReact'
    DEV_PROJECT = 'trinity-dev'
    PROD_PROJECT = 'trinity-prod'
  }

  stages {
    stage('Checkout Code') {
      steps {
        echo "📦 Checking out branch: ${env.BRANCH_NAME}"
        checkout scm
      }
    }

    stage('Deploy Dev Environment') {
      when {
        branch 'dev'
      }
      steps {
        echo "🚀 Deploying DEV environment..."
        bat """
        cd /d "${env.DEV_DIR}"
        docker compose -p %DEV_PROJECT% -f docker-compose-dev.yml down || exit 0
        docker compose -p %DEV_PROJECT% -f docker-compose-dev.yml up --build -d
        timeout /t 15
        docker compose -p %DEV_PROJECT% -f docker-compose-dev.yml exec web python create_tenant.py
        """
      }
    }

    stage('Deploy Prod Environment') {
      when {
        branch 'main'
      }
      steps {
        echo "🚀 Deploying PROD environment..."
        bat """
        cd /d "${env.PROD_DIR}"
        docker compose -p %PROD_PROJECT% -f docker-compose.yml down || exit 0
        docker compose -p %PROD_PROJECT% -f docker-compose.yml up --build -d
        timeout /t 15
        docker compose -p %PROD_PROJECT% -f docker-compose.yml exec web python create_tenant.py
        """
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
