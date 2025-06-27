# RadScheduler Production Deployment Checklist

## Pre-Deployment Code Changes

### Security & Compliance
- [ ] **Remove hardcoded secrets** from all `.env` files and code
- [ ] **Update logger** to redact PHI (names, phone numbers, patient IDs) from logs
- [ ] **Add input validation** to all API endpoints
- [ ] **Implement rate limiting** for public endpoints
- [ ] **Add CORS restrictions** to only trusted domains
- [ ] **Update error handling** to not leak sensitive information
- [ ] **Add audit logging** for all PHI access
- [ ] **Remove debug endpoints** or secure them properly

### Infrastructure Readiness
- [ ] **Update database connection** to use environment variables
- [ ] **Update Redis connection** to use environment variables
- [ ] **Add health check endpoint** (`/health`) that doesn't leak info
- [ ] **Update all API keys** to use environment variables
- [ ] **Test environment variable loading** in production mode
- [ ] **Add graceful shutdown** handling
- [ ] **Update logging** to use structured JSON format

### Vendor Integrations
- [ ] **Verify Twilio credentials** are stored securely
- [ ] **Confirm Anthropic API key** is properly configured
- [ ] **Test SMS functionality** with real phone numbers
- [ ] **Test AI conflict detection** with real data
- [ ] **Verify Mirth Connect** configuration for HL7

## AWS Infrastructure Setup

### Networking
- [ ] **Create VPC** with public and private subnets
- [ ] **Set up security groups** with least privilege access
- [ ] **Configure route tables** for public/private subnets
- [ ] **Set up NAT Gateway** for private subnet internet access
- [ ] **Configure VPC endpoints** for AWS services (optional)

### Database (RDS)
- [ ] **Create RDS PostgreSQL instance** with encryption at rest
- [ ] **Enable automated backups** with 7+ day retention
- [ ] **Configure multi-AZ** for high availability
- [ ] **Set up monitoring** and performance insights
- [ ] **Configure security groups** to only allow API access
- [ ] **Test database connectivity** from application

### Cache (ElastiCache)
- [ ] **Create ElastiCache Redis cluster** with encryption
- [ ] **Configure security groups** for Redis access
- [ ] **Set up monitoring** for Redis performance
- [ ] **Test Redis connectivity** from application

### Container Registry (ECR)
- [ ] **Create ECR repository** for API images
- [ ] **Configure image scanning** for vulnerabilities
- [ ] **Set up lifecycle policies** for old images
- [ ] **Test image push/pull** process

## Application Deployment

### Docker Configuration
- [ ] **Create production Dockerfile** with security best practices
- [ ] **Use non-root user** in container
- [ ] **Add health checks** to Dockerfile
- [ ] **Optimize image size** (multi-stage builds)
- [ ] **Scan image** for vulnerabilities
- [ ] **Test container** locally before pushing

### ECS Setup
- [ ] **Create ECS cluster** for application
- [ ] **Define task definition** with proper resource limits
- [ ] **Configure secrets** using AWS Secrets Manager
- [ ] **Set up logging** to CloudWatch
- [ ] **Configure auto-scaling** policies
- [ ] **Test task definition** locally

### Load Balancer
- [ ] **Create Application Load Balancer** (ALB)
- [ ] **Configure HTTPS listener** with SSL certificate
- [ ] **Set up target groups** for API endpoints
- [ ] **Configure health checks** for ALB
- [ ] **Set up access logging** for ALB
- [ ] **Test load balancer** routing

## Security & Compliance

### AWS Security
- [ ] **Enable CloudTrail** for audit logging
- [ ] **Set up VPC Flow Logs** for network monitoring
- [ ] **Configure AWS Config** for compliance monitoring
- [ ] **Set up GuardDuty** for threat detection (optional)
- [ ] **Enable AWS Shield** for DDoS protection (optional)

### Access Control
- [ ] **Create IAM roles** with least privilege
- [ ] **Configure ECS task roles** for service access
- [ ] **Set up cross-account access** if needed
- [ ] **Review and rotate** access keys regularly
- [ ] **Enable MFA** for all users

### Data Protection
- [ ] **Enable encryption at rest** for all data stores
- [ ] **Enable encryption in transit** for all communications
- [ ] **Configure backup encryption** for RDS
- [ ] **Set up key rotation** policies
- [ ] **Test data encryption** end-to-end

## Monitoring & Observability

### CloudWatch Setup
- [ ] **Create log groups** for application logs
- [ ] **Set up metric filters** for important events
- [ ] **Configure alarms** for critical metrics
- [ ] **Set up dashboards** for monitoring
- [ ] **Configure log retention** policies

### Application Monitoring
- [ ] **Add application metrics** (response times, error rates)
- [ ] **Set up distributed tracing** (optional)
- [ ] **Configure error tracking** (Sentry, etc.)
- [ ] **Set up uptime monitoring** (PagerDuty, etc.)
- [ ] **Test alerting** for critical issues

### Performance Monitoring
- [ ] **Monitor RDS performance** with Performance Insights
- [ ] **Track Redis metrics** and memory usage
- [ ] **Monitor ECS resource utilization**
- [ ] **Set up cost monitoring** and alerts
- [ ] **Configure capacity planning** alerts

## Business Associate Agreements (BAA)

### Vendor Compliance
- [ ] **Sign BAA with AWS** for HIPAA compliance
- [ ] **Sign BAA with Twilio** for SMS services
- [ ] **Verify Anthropic BAA status** (currently not available)
- [ ] **Document BAA status** for all vendors
- [ ] **Set up BAA renewal** reminders

### Data Handling
- [ ] **Verify no PHI sent to non-BAA vendors**
- [ ] **Configure data retention** policies
- [ ] **Set up data deletion** procedures
- [ ] **Document data flow** and storage locations
- [ ] **Test data privacy** controls

## Testing & Validation

### Pre-Deployment Testing
- [ ] **Run unit tests** for all components
- [ ] **Perform integration testing** with all services
- [ ] **Test database migrations** in staging
- [ ] **Validate environment variables** are loaded correctly
- [ ] **Test error handling** and recovery procedures

### End-to-End Testing
- [ ] **Test HL7 message processing** end-to-end
- [ ] **Verify SMS notifications** are sent correctly
- [ ] **Test AI conflict detection** with real scenarios
- [ ] **Validate WebSocket connections** for real-time updates
- [ ] **Test API endpoints** with production data

### Performance Testing
- [ ] **Load test API endpoints** under expected traffic
- [ ] **Test database performance** under load
- [ ] **Verify auto-scaling** works correctly
- [ ] **Test failover scenarios** for high availability
- [ ] **Measure response times** and throughput

## Go-Live Preparation

### DNS & SSL
- [ ] **Configure DNS** to point to ALB
- [ ] **Obtain SSL certificate** for domain
- [ ] **Configure SSL termination** at ALB
- [ ] **Test HTTPS connectivity** end-to-end
- [ ] **Verify SSL certificate** is valid and trusted

### Backup & Recovery
- [ ] **Test database backups** and restore procedures
- [ ] **Verify RDS automated backups** are working
- [ ] **Set up cross-region replication** (optional)
- [ ] **Document disaster recovery** procedures
- [ ] **Test recovery procedures** in staging

### Documentation
- [ ] **Update runbooks** for operations team
- [ ] **Document troubleshooting** procedures
- [ ] **Create incident response** playbooks
- [ ] **Update architecture diagrams**
- [ ] **Document security procedures**

## Post-Deployment

### Monitoring & Alerts
- [ ] **Verify all alarms** are working correctly
- [ ] **Test alert notifications** (email, SMS, Slack)
- [ ] **Monitor application logs** for errors
- [ ] **Check performance metrics** are within expected ranges
- [ ] **Validate security monitoring** is active

### User Acceptance Testing
- [ ] **Test with real HL7 messages** from hospital systems
- [ ] **Verify SMS notifications** are received by users
- [ ] **Test admin dashboard** functionality
- [ ] **Validate analytics** and reporting features
- [ ] **Confirm real-time updates** are working

### Performance Validation
- [ ] **Monitor response times** under real load
- [ ] **Track error rates** and availability
- [ ] **Monitor resource utilization** (CPU, memory, disk)
- [ ] **Validate auto-scaling** behavior
- [ ] **Check cost metrics** against budget

## Ongoing Maintenance

### Regular Tasks
- [ ] **Security updates** for dependencies and base images
- [ ] **Performance monitoring** and optimization
- [ ] **Cost optimization** and resource right-sizing
- [ ] **Compliance audits** and documentation updates
- [ ] **Backup testing** and validation

### Incident Response
- [ ] **Set up on-call rotation** for 24/7 support
- [ ] **Create escalation procedures** for critical issues
- [ ] **Document incident response** procedures
- [ ] **Set up post-incident review** process
- [ ] **Maintain runbooks** for common issues

### Compliance & Security
- [ ] **Regular security assessments** and penetration testing
- [ ] **HIPAA compliance audits** and documentation
- [ ] **Access review** and privilege management
- [ ] **Security monitoring** and threat detection
- [ ] **Vendor BAA renewals** and compliance checks

## Rollback Plan

### Emergency Procedures
- [ ] **Document rollback procedures** for each component
- [ ] **Test rollback procedures** in staging environment
- [ ] **Set up quick rollback** mechanisms
- [ ] **Define rollback decision** criteria
- [ ] **Communicate rollback procedures** to stakeholders

### Data Protection
- [ ] **Verify data integrity** after rollback
- [ ] **Test data recovery** procedures
- [ ] **Document data loss** prevention measures
- [ ] **Set up data validation** after rollback
- [ ] **Communicate data status** to users

## Success Criteria

### Technical Metrics
- [ ] **99.9% uptime** or better
- [ ] **< 200ms average response time** for API calls
- [ ] **< 1% error rate** for all endpoints
- [ ] **Successful SMS delivery** > 95%
- [ ] **AI response time** < 5 seconds

### Business Metrics
- [ ] **Successful HL7 processing** > 99%
- [ ] **User satisfaction** with SMS notifications
- [ ] **Reduced scheduling conflicts** through AI detection
- [ ] **Cost savings** from improved efficiency
- [ ] **Compliance with HIPAA** requirements

### Operational Metrics
- [ ] **Mean time to resolution** < 30 minutes for critical issues
- [ ] **Zero data loss** incidents
- [ ] **Successful backup and recovery** tests
- [ ] **Security incident** response time < 1 hour
- [ ] **Documentation completeness** > 95% 