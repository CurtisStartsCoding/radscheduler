# RadScheduler AWS Production Deployment Guide

## Overview

This guide provides step-by-step instructions for deploying RadScheduler to AWS in a HIPAA-compliant, production-ready environment.

## Prerequisites

- AWS Account with appropriate permissions
- AWS CLI configured
- Docker installed locally
- Domain name (optional, for SSL certificates)

## Architecture

```
Internet → ALB (HTTPS) → ECS Fargate → API Container
                    ↓
                RDS PostgreSQL (Encrypted)
                ElastiCache Redis (Encrypted)
                Secrets Manager (Credentials)
```

## Step 1: AWS Infrastructure Setup

### 1.1 Create VPC and Networking

```bash
# Create VPC with public and private subnets
aws ec2 create-vpc --cidr-block 10.0.0.0/16 --tag-specifications ResourceType=vpc,Tags=[{Key=Name,Value=radscheduler-vpc}]

# Create public subnets (for ALB)
aws ec2 create-subnet --vpc-id vpc-xxxxx --cidr-block 10.0.1.0/24 --availability-zone us-east-1a
aws ec2 create-subnet --vpc-id vpc-xxxxx --cidr-block 10.0.2.0/24 --availability-zone us-east-1b

# Create private subnets (for RDS, ElastiCache, ECS)
aws ec2 create-subnet --vpc-id vpc-xxxxx --cidr-block 10.0.3.0/24 --availability-zone us-east-1a
aws ec2 create-subnet --vpc-id vpc-xxxxx --cidr-block 10.0.4.0/24 --availability-zone us-east-1b
```

### 1.2 Create Security Groups

```bash
# ALB Security Group
aws ec2 create-security-group --group-name radscheduler-alb-sg --description "ALB Security Group" --vpc-id vpc-xxxxx
aws ec2 authorize-security-group-ingress --group-id sg-xxxxx --protocol tcp --port 80 --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress --group-id sg-xxxxx --protocol tcp --port 443 --cidr 0.0.0.0/0

# API Security Group
aws ec2 create-security-group --group-name radscheduler-api-sg --description "API Security Group" --vpc-id vpc-xxxxx
aws ec2 authorize-security-group-ingress --group-id sg-xxxxx --protocol tcp --port 3001 --source-group sg-xxxxx

# RDS Security Group
aws ec2 create-security-group --group-name radscheduler-rds-sg --description "RDS Security Group" --vpc-id vpc-xxxxx
aws ec2 authorize-security-group-ingress --group-id sg-xxxxx --protocol tcp --port 5432 --source-group sg-xxxxx

# Redis Security Group
aws ec2 create-security-group --group-name radscheduler-redis-sg --description "Redis Security Group" --vpc-id vpc-xxxxx
aws ec2 authorize-security-group-ingress --group-id sg-xxxxx --protocol tcp --port 6379 --source-group sg-xxxxx
```

## Step 2: Database Setup (RDS)

### 2.1 Create RDS Subnet Group

```bash
aws rds create-db-subnet-group \
  --db-subnet-group-name radscheduler-db-subnet-group \
  --db-subnet-group-description "RadScheduler DB Subnet Group" \
  --subnet-ids subnet-xxxxx subnet-yyyyy
```

### 2.2 Create RDS PostgreSQL Instance

```bash
aws rds create-db-instance \
  --db-instance-identifier radscheduler-db \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --engine-version 15.4 \
  --master-username raduser \
  --master-user-password "SecurePassword123!" \
  --allocated-storage 20 \
  --storage-type gp2 \
  --storage-encrypted \
  --db-subnet-group-name radscheduler-db-subnet-group \
  --vpc-security-group-ids sg-xxxxx \
  --backup-retention-period 7 \
  --multi-az \
  --deletion-protection
```

## Step 3: Redis Setup (ElastiCache)

### 3.1 Create ElastiCache Subnet Group

```bash
aws elasticache create-cache-subnet-group \
  --cache-subnet-group-name radscheduler-redis-subnet-group \
  --cache-subnet-group-description "RadScheduler Redis Subnet Group" \
  --subnet-ids subnet-xxxxx subnet-yyyyy
```

### 3.2 Create ElastiCache Redis Cluster

```bash
aws elasticache create-cache-cluster \
  --cache-cluster-id radscheduler-redis \
  --engine redis \
  --cache-node-type cache.t3.micro \
  --num-cache-nodes 1 \
  --cache-subnet-group-name radscheduler-redis-subnet-group \
  --security-group-ids sg-xxxxx \
  --transit-encryption-enabled \
  --at-rest-encryption-enabled
```

## Step 4: Secrets Management

### 4.1 Store Secrets in AWS Secrets Manager

```bash
# Database credentials
aws secretsmanager create-secret \
  --name radscheduler/database \
  --description "RadScheduler database credentials" \
  --secret-string '{"username":"raduser","password":"SecurePassword123!","host":"radscheduler-db.xxxxx.us-east-1.rds.amazonaws.com","port":5432,"database":"radscheduler"}'

# Twilio credentials
aws secretsmanager create-secret \
  --name radscheduler/twilio \
  --description "RadScheduler Twilio credentials" \
  --secret-string '{"accountSid":"ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx","authToken":"your_auth_token","phoneNumber":"+1234567890"}'

# Anthropic API key
aws secretsmanager create-secret \
  --name radscheduler/anthropic \
  --description "RadScheduler Anthropic API key" \
  --secret-string '{"apiKey":"sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"}'
```

## Step 5: Container Registry Setup

### 5.1 Create ECR Repository

```bash
aws ecr create-repository --repository-name radscheduler-api
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 123456789012.dkr.ecr.us-east-1.amazonaws.com
```

### 5.2 Build and Push Docker Image

```bash
# Build the image
docker build -t radscheduler-api ./api

# Tag for ECR
docker tag radscheduler-api:latest 123456789012.dkr.ecr.us-east-1.amazonaws.com/radscheduler-api:latest

# Push to ECR
docker push 123456789012.dkr.ecr.us-east-1.amazonaws.com/radscheduler-api:latest
```

## Step 6: ECS Setup

### 6.1 Create ECS Cluster

```bash
aws ecs create-cluster --cluster-name radscheduler-cluster
```

### 6.2 Create Task Definition

Create `task-definition.json`:

```json
{
  "family": "radscheduler-api",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "executionRoleArn": "arn:aws:iam::123456789012:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::123456789012:role/ecsTaskRole",
  "containerDefinitions": [
    {
      "name": "radscheduler-api",
      "image": "123456789012.dkr.ecr.us-east-1.amazonaws.com/radscheduler-api:latest",
      "portMappings": [
        {
          "containerPort": 3001,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        },
        {
          "name": "PORT",
          "value": "3001"
        }
      ],
      "secrets": [
        {
          "name": "DATABASE_URL",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:123456789012:secret:radscheduler/database"
        },
        {
          "name": "REDIS_URL",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:123456789012:secret:radscheduler/redis"
        },
        {
          "name": "TWILIO_ACCOUNT_SID",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:123456789012:secret:radscheduler/twilio:accountSid::"
        },
        {
          "name": "TWILIO_AUTH_TOKEN",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:123456789012:secret:radscheduler/twilio:authToken::"
        },
        {
          "name": "ANTHROPIC_API_KEY",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:123456789012:secret:radscheduler/anthropic:apiKey::"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/radscheduler-api",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:3001/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 60
      }
    }
  ]
}
```

Register the task definition:

```bash
aws ecs register-task-definition --cli-input-json file://task-definition.json
```

### 6.3 Create ECS Service

```bash
aws ecs create-service \
  --cluster radscheduler-cluster \
  --service-name radscheduler-api-service \
  --task-definition radscheduler-api:1 \
  --desired-count 2 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxxxx,subnet-yyyyy],securityGroups=[sg-xxxxx],assignPublicIp=DISABLED}" \
  --load-balancers "targetGroupArn=arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/radscheduler-tg,containerName=radscheduler-api,containerPort=3001"
```

## Step 7: Load Balancer Setup

### 7.1 Create Application Load Balancer

```bash
aws elbv2 create-load-balancer \
  --name radscheduler-alb \
  --subnets subnet-xxxxx subnet-yyyyy \
  --security-groups sg-xxxxx
```

### 7.2 Create Target Group

```bash
aws elbv2 create-target-group \
  --name radscheduler-tg \
  --protocol HTTP \
  --port 3001 \
  --vpc-id vpc-xxxxx \
  --target-type ip \
  --health-check-path /health \
  --health-check-interval-seconds 30 \
  --healthy-threshold-count 2 \
  --unhealthy-threshold-count 3
```

### 7.3 Create HTTPS Listener

```bash
# Create SSL certificate (if you have a domain)
aws acm import-certificate \
  --certificate fileb://certificate.pem \
  --private-key fileb://private-key.pem \
  --certificate-chain fileb://chain.pem

# Create HTTPS listener
aws elbv2 create-listener \
  --load-balancer-arn arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/radscheduler-alb/xxxxx \
  --protocol HTTPS \
  --port 443 \
  --certificates CertificateArn=arn:aws:acm:us-east-1:123456789012:certificate/xxxxx \
  --default-actions Type=forward,TargetGroupArn=arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/radscheduler-tg/xxxxx
```

## Step 8: Monitoring and Logging

### 8.1 Create CloudWatch Log Group

```bash
aws logs create-log-group --log-group-name /ecs/radscheduler-api
```

### 8.2 Set up CloudWatch Alarms

```bash
# High CPU alarm
aws cloudwatch put-metric-alarm \
  --alarm-name radscheduler-high-cpu \
  --alarm-description "High CPU utilization" \
  --metric-name CPUUtilization \
  --namespace AWS/ECS \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2 \
  --alarm-actions arn:aws:sns:us-east-1:123456789012:radscheduler-alerts

# High memory alarm
aws cloudwatch put-metric-alarm \
  --alarm-name radscheduler-high-memory \
  --alarm-description "High memory utilization" \
  --metric-name MemoryUtilization \
  --namespace AWS/ECS \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2 \
  --alarm-actions arn:aws:sns:us-east-1:123456789012:radscheduler-alerts
```

## Step 9: Database Migration

### 9.1 Run Database Migrations

```bash
# Connect to your ECS task and run migrations
aws ecs run-task \
  --cluster radscheduler-cluster \
  --task-definition radscheduler-api:1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxxxx],securityGroups=[sg-xxxxx],assignPublicIp=ENABLED}" \
  --overrides '{"containerOverrides":[{"name":"radscheduler-api","command":["node","scripts/init-db.js"]}]}'
```

## Step 10: Testing and Validation

### 10.1 Health Check

```bash
# Test the health endpoint
curl -k https://your-alb-dns-name/health
```

### 10.2 API Endpoints

```bash
# Test API endpoints
curl -k https://your-alb-dns-name/api/appointments
curl -k https://your-alb-dns-name/api/analytics
```

### 10.3 HL7 Simulation

```bash
# Test HL7 endpoint
curl -k -X POST https://your-alb-dns-name/api/hl7/simulate \
  -H "Content-Type: application/json" \
  -d '{"patientId":"TEST123","patientName":"Test Patient","patientPhone":"+1234567890","modality":"MRI","studyType":"Brain","datetime":"2024-01-15T10:00:00Z","duration":45}'
```

## Step 11: Security and Compliance

### 11.1 Enable CloudTrail

```bash
aws cloudtrail create-trail \
  --name radscheduler-trail \
  --s3-bucket-name your-audit-bucket \
  --include-global-service-events
```

### 11.2 Enable VPC Flow Logs

```bash
aws ec2 create-flow-logs \
  --resource-type VPC \
  --resource-ids vpc-xxxxx \
  --traffic-type ALL \
  --log-destination-type s3 \
  --log-destination arn:aws:s3:::your-flow-logs-bucket
```

### 11.3 Business Associate Agreements

- [ ] Sign BAA with AWS
- [ ] Sign BAA with Twilio
- [ ] Verify Anthropic BAA status (currently not available)

## Step 12: Backup and Disaster Recovery

### 12.1 Database Backups

RDS automated backups are enabled by default. Verify:

```bash
aws rds describe-db-instances --db-instance-identifier radscheduler-db --query 'DBInstances[0].BackupRetentionPeriod'
```

### 12.2 Cross-Region Replication

Consider setting up cross-region replication for critical data.

## Monitoring and Maintenance

### Regular Tasks

1. **Security Updates**: Regularly update Docker images and dependencies
2. **Performance Monitoring**: Monitor CloudWatch metrics and logs
3. **Cost Optimization**: Review and optimize resource usage
4. **Compliance Audits**: Regular HIPAA compliance reviews

### Troubleshooting

1. **Check ECS Service Logs**: `aws logs describe-log-streams --log-group-name /ecs/radscheduler-api`
2. **Check RDS Performance**: Use RDS Performance Insights
3. **Monitor ALB Access Logs**: Enable access logging for the ALB

## Cost Estimation

Estimated monthly costs for a small deployment:

- RDS PostgreSQL (db.t3.micro): ~$15/month
- ElastiCache Redis (cache.t3.micro): ~$15/month
- ECS Fargate (2 tasks): ~$30/month
- ALB: ~$20/month
- Data transfer: ~$10/month
- **Total: ~$90/month**

## Next Steps

1. Set up CI/CD pipeline for automated deployments
2. Implement blue-green deployments
3. Add monitoring dashboards
4. Set up automated testing
5. Implement disaster recovery procedures 