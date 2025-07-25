pipeline {
  agent any

  environment {
    DEV_COMPOSE_FILE = "docker-compose-dev.yml"
    PROD_COMPOSE_FILE = "docker-compose.yml"
    DEV_PROJECT = "trinity-dev"
    PROD_PROJECT = "trinity-prod"
  }

  stages {

    stage('Checkout Code') {
      steps {
        echo "📦 Checking out code from ${env.BRANCH_NAME}..."
        checkout scm
      }
    }

    stage('Build & Deploy Dev Environment') {
      when {
        branch 'dev'
      }
      steps {
        echo "🚧 Building Dev Environment..."
        sh "docker compose -p ${DEV_PROJECT} -f ${DEV_COMPOSE_FILE} build"
        sh "docker compose -p ${DEV_PROJECT} -f ${DEV_COMPOSE_FILE} up -d"
        sh "docker compose -p ${DEV_PROJECT} exec web python create_tenant.py"
        echo "✅ Dev deployed to http://trinity-dev.quantmatrixai.com"
      }
    }

    stage('Build & Deploy Prod Environment') {
      when {
        branch 'main'
      }
      steps {
        echo "🚀 Deploying Production Environment..."
        sh "docker compose -p ${PROD_PROJECT} -f ${PROD_COMPOSE_FILE} build"
        sh "docker compose -p ${PROD_PROJECT} -f ${PROD_COMPOSE_FILE} up -d"
        sh "docker compose -p ${PROD_PROJECT} exec web python create_tenant.py"
        echo "✅ Production deployed to https://trinity.quantmatrixai.com"
      }
    }
  }

  post {
    success {
      echo "🎉 Build and Deployment Successful for ${env.BRANCH_NAME}"
      // Later: Slack/email notification here
    }
    failure {
      echo "❌ Build Failed for ${env.BRANCH_NAME}"
      // Later: Slack/email alert on failure
    }
  }
}
