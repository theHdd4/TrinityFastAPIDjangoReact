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
        echo "📦 Checking out branch: ${env.BRANCH_NAME}"
        checkout scm
      }
    }

    stage('Prepare Env & Compose Files') {
      steps {
        script {
          dir("${WORKSPACE}") {
            // Convert docker-compose-example.yml → docker-compose-dev.yml
            if (fileExists("docker-compose-example.yml")) {
              writeFile file: "${DEV_COMPOSE_FILE}", text: readFile("docker-compose-example.yml")
              echo "✅ Created ${DEV_COMPOSE_FILE}"
            }

            // Convert .env.example → .env
            if (fileExists(".env.example")) {
              writeFile file: ".env", text: readFile(".env.example")
              echo "✅ Created .env"
            }
          }
        }
      }
    }

    stage('Deploy Dev Environment') {
      steps {
        script {
          dir("${WORKSPACE}") {
            bat """
              echo Checking if ${DEV_PROJECT}_web is running...
              docker compose -p ${DEV_PROJECT} -f ${DEV_COMPOSE_FILE} ps -q web > tmp_container.txt

              set /p WEB_ID=<tmp_container.txt
              if not "%WEB_ID%"=="" (
                echo Found running web container: %WEB_ID%
                echo Bringing down stack...
                docker compose -p ${DEV_PROJECT} -f ${DEV_COMPOSE_FILE} down
              )

              echo Starting fresh stack...
              docker compose -p ${DEV_PROJECT} -f ${DEV_COMPOSE_FILE} up -d --build
            """
          }
        }
      }
    }

    stage('Wait for Web Service') {
      steps {
        script {
          dir("${WORKSPACE}") {
            bat """
              setlocal enabledelayedexpansion
              set RETRIES=60
              set SERVICE_UP=0

              echo Waiting up to 5 minutes for web service...

              :waitloop
              curl -s http://10.2.1.65:9001/health >nul 2>&1
              if !ERRORLEVEL! == 0 (
                echo ✓ Web service is up!
                set SERVICE_UP=1
                goto :ready
              )

              set /a RETRIES-=1
              if !RETRIES! GTR 0 (
                echo Web not up yet... retrying in 5s...
                ping -n 6 127.0.0.1 >nul
                goto :waitloop
              )

              :ready
              if !SERVICE_UP! == 0 (
                echo ✗ Web service did not come up in 5 minutes.
                exit /b 1
              )
            """
          }
        }
      }
    }

    stage('Create Tenant') {
      steps {
        script {
          dir("${WORKSPACE}") {
            bat """
              echo Running tenant creation script...
              docker compose -p ${DEV_PROJECT} -f ${DEV_COMPOSE_FILE} exec -T web python manage.py create_tenant
            """
          }
        }
      }
    }

  }

  post {
    failure {
      echo "✗ Deployment failed on branch ${env.BRANCH_NAME}"
    }
    success {
      echo "✅ Deployment succeeded on branch ${env.BRANCH_NAME}"
    }
  }
}
