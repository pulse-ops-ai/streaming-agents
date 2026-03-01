output "oidc_provider_arn" {
  description = "ARN of the GitHub Actions OIDC provider"
  value       = aws_iam_openid_connect_provider.github_actions.arn
}

output "github_deploy_role_arns" {
  description = "ARNs of the GitHub deployment roles by environment"
  value = {
    for env in local.environments :
    env => aws_iam_role.github_deploy[env].arn
  }
}

output "github_deploy_role_names" {
  description = "Names of the GitHub deployment roles by environment"
  value = {
    for env in local.environments :
    env => aws_iam_role.github_deploy[env].name
  }
}
