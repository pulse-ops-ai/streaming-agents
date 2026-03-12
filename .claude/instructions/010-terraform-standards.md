# 010 – Terraform Standards

- Use modules under `infra/modules/` for reusable components
- Environment configs live under `infra/envs/{localstack,aws-sandbox}/`
- Pin provider versions in `providers.tf`
- Never commit `.tfstate` – use remote backend for AWS sandbox
