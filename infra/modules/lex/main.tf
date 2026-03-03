variable "enable_lex" {
  description = "Whether to deploy Amazon Lex V2 resources (unsupported in LocalStack Community)"
  type        = bool
  default     = false
}

variable "lambda_fulfillment_arn" {
  description = "The ARN of the conversation-agent Lambda function used for fulfillment"
  type        = string
}

resource "aws_iam_role" "lex_exec_role" {
  count = var.enable_lex ? 1 : 0
  name  = "streaming-agents-lex-exec-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lexv2.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lex_polly" {
  count      = var.enable_lex ? 1 : 0
  role       = aws_iam_role.lex_exec_role[0].name
  policy_arn = "arn:aws:iam::aws:policy/AmazonPollyReadOnlyAccess"
}

resource "aws_lexv2models_bot" "copilot" {
  count                       = var.enable_lex ? 1 : 0
  name                        = "streaming-agents-copilot"
  role_arn                    = aws_iam_role.lex_exec_role[0].arn
  idle_session_ttl_in_seconds = 300
  data_privacy {
    child_directed = false
  }
}

resource "aws_lexv2models_bot_locale" "en_us" {
  count                            = var.enable_lex ? 1 : 0
  bot_id                           = aws_lexv2models_bot.copilot[0].id
  bot_version                      = "DRAFT"
  locale_id                        = "en_US"
  n_lu_intent_confidence_threshold = 0.40

  voice_settings {
    voice_id = "Matthew"
    engine   = "neural"
  }
}

# --- Shared Slot Type: AssetId ---
resource "aws_lexv2models_slot_type" "asset_id" {
  count       = var.enable_lex ? 1 : 0
  bot_id      = aws_lexv2models_bot.copilot[0].id
  bot_version = aws_lexv2models_bot_locale.en_us[0].bot_version
  locale_id   = aws_lexv2models_bot_locale.en_us[0].locale_id
  name        = "AssetId"

  value_selection_setting {
    resolution_strategy = "OriginalValue"
  }

  slot_type_values {
    sample_value { value = "R-1" }
  }
  slot_type_values {
    sample_value { value = "R-17" }
  }
  slot_type_values {
    sample_value { value = "R-50" }
  }
  slot_type_values {
    sample_value { value = "R-99" }
  }
}

# --- Intents ---

# 1. AssetStatus
resource "aws_lexv2models_intent" "asset_status" {
  count       = var.enable_lex ? 1 : 0
  bot_id      = aws_lexv2models_bot.copilot[0].id
  bot_version = aws_lexv2models_bot_locale.en_us[0].bot_version
  locale_id   = aws_lexv2models_bot_locale.en_us[0].locale_id
  name        = "AssetStatus"

  sample_utterance { utterance = "How is {asset_id}" }
  sample_utterance { utterance = "What's the status of {asset_id}" }
  sample_utterance { utterance = "Status of {asset_id}" }
  sample_utterance { utterance = "Check on {asset_id}" }
  sample_utterance { utterance = "Is {asset_id} okay" }

  fulfillment_code_hook {
    enabled = true
  }
}

resource "aws_lexv2models_slot" "asset_status_asset_id" {
  count        = var.enable_lex ? 1 : 0
  bot_id       = aws_lexv2models_bot.copilot[0].id
  bot_version  = aws_lexv2models_bot_locale.en_us[0].bot_version
  locale_id    = aws_lexv2models_bot_locale.en_us[0].locale_id
  intent_id    = aws_lexv2models_intent.asset_status[0].intent_id
  name         = "asset_id"
  slot_type_id = aws_lexv2models_slot_type.asset_id[0].slot_type_id

  value_elicitation_setting {
    prompt_specification {
      max_retries = 2
      message_group {
        message {
          plain_text_message {
            value = "Which robot are you asking about? For example, R-17."
          }
        }
      }
    }
    slot_constraint = "Required"
  }
}

# 2. FleetOverview
resource "aws_lexv2models_intent" "fleet_overview" {
  count       = var.enable_lex ? 1 : 0
  bot_id      = aws_lexv2models_bot.copilot[0].id
  bot_version = aws_lexv2models_bot_locale.en_us[0].bot_version
  locale_id   = aws_lexv2models_bot_locale.en_us[0].locale_id
  name        = "FleetOverview"

  sample_utterance { utterance = "Any alerts" }
  sample_utterance { utterance = "Fleet status" }
  sample_utterance { utterance = "How are the robots" }
  sample_utterance { utterance = "Show me the fleet" }
  sample_utterance { utterance = "Are there any problems" }
  sample_utterance { utterance = "What needs attention" }

  fulfillment_code_hook {
    enabled = true
  }
}

# 3. ExplainRisk
resource "aws_lexv2models_intent" "explain_risk" {
  count       = var.enable_lex ? 1 : 0
  bot_id      = aws_lexv2models_bot.copilot[0].id
  bot_version = aws_lexv2models_bot_locale.en_us[0].bot_version
  locale_id   = aws_lexv2models_bot_locale.en_us[0].locale_id
  name        = "ExplainRisk"

  sample_utterance { utterance = "Why is {asset_id} critical" }
  sample_utterance { utterance = "What's wrong with {asset_id}" }
  sample_utterance { utterance = "Explain {asset_id}" }
  sample_utterance { utterance = "What's happening with {asset_id}" }
  sample_utterance { utterance = "Why is {asset_id} at risk" }

  fulfillment_code_hook {
    enabled = true
  }
}

resource "aws_lexv2models_slot" "explain_risk_asset_id" {
  count        = var.enable_lex ? 1 : 0
  bot_id       = aws_lexv2models_bot.copilot[0].id
  bot_version  = aws_lexv2models_bot_locale.en_us[0].bot_version
  locale_id    = aws_lexv2models_bot_locale.en_us[0].locale_id
  intent_id    = aws_lexv2models_intent.explain_risk[0].intent_id
  name         = "asset_id"
  slot_type_id = aws_lexv2models_slot_type.asset_id[0].slot_type_id

  value_elicitation_setting {
    prompt_specification {
      max_retries = 2
      message_group {
        message {
          plain_text_message {
            value = "Which robot do you need explained?"
          }
        }
      }
    }
    slot_constraint = "Required"
  }
}

# 4. RecommendAction
resource "aws_lexv2models_intent" "recommend_action" {
  count       = var.enable_lex ? 1 : 0
  bot_id      = aws_lexv2models_bot.copilot[0].id
  bot_version = aws_lexv2models_bot_locale.en_us[0].bot_version
  locale_id   = aws_lexv2models_bot_locale.en_us[0].locale_id
  name        = "RecommendAction"

  sample_utterance { utterance = "What should I do about {asset_id}" }
  sample_utterance { utterance = "How do I fix {asset_id}" }
  sample_utterance { utterance = "What do you recommend for {asset_id}" }
  sample_utterance { utterance = "Next steps for {asset_id}" }

  fulfillment_code_hook {
    enabled = true
  }
}

resource "aws_lexv2models_slot" "recommend_action_asset_id" {
  count        = var.enable_lex ? 1 : 0
  bot_id       = aws_lexv2models_bot.copilot[0].id
  bot_version  = aws_lexv2models_bot_locale.en_us[0].bot_version
  locale_id    = aws_lexv2models_bot_locale.en_us[0].locale_id
  intent_id    = aws_lexv2models_intent.recommend_action[0].intent_id
  name         = "asset_id"
  slot_type_id = aws_lexv2models_slot_type.asset_id[0].slot_type_id

  value_elicitation_setting {
    prompt_specification {
      max_retries = 2
      message_group {
        message {
          plain_text_message {
            value = "Which robot do you want recommendations for?"
          }
        }
      }
    }
    slot_constraint = "Required"
  }
}

# 5. AcknowledgeIncident
resource "aws_lexv2models_intent" "acknowledge_incident" {
  count       = var.enable_lex ? 1 : 0
  bot_id      = aws_lexv2models_bot.copilot[0].id
  bot_version = aws_lexv2models_bot_locale.en_us[0].bot_version
  locale_id   = aws_lexv2models_bot_locale.en_us[0].locale_id
  name        = "AcknowledgeIncident"

  sample_utterance { utterance = "Acknowledge {asset_id}" }
  sample_utterance { utterance = "I'm on it for {asset_id}" }
  sample_utterance { utterance = "Got it for {asset_id}" }
  sample_utterance { utterance = "Acknowledged {asset_id}" }

  fulfillment_code_hook {
    enabled = true
  }
}

resource "aws_lexv2models_slot" "acknowledge_incident_asset_id" {
  count        = var.enable_lex ? 1 : 0
  bot_id       = aws_lexv2models_bot.copilot[0].id
  bot_version  = aws_lexv2models_bot_locale.en_us[0].bot_version
  locale_id    = aws_lexv2models_bot_locale.en_us[0].locale_id
  intent_id    = aws_lexv2models_intent.acknowledge_incident[0].intent_id
  name         = "asset_id"
  slot_type_id = aws_lexv2models_slot_type.asset_id[0].slot_type_id

  value_elicitation_setting {
    prompt_specification {
      max_retries = 2
      message_group {
        message {
          plain_text_message {
            value = "Which robot's alert are you acknowledging?"
          }
        }
      }
    }
    slot_constraint = "Required"
  }
}

# --- Alias & Hook Integration ---
resource "aws_lexv2models_bot_version" "copilot_ver" {
  count  = var.enable_lex ? 1 : 0
  bot_id = aws_lexv2models_bot.copilot[0].id
  locale_specification = {
    (aws_lexv2models_bot_locale.en_us[0].locale_id) = {
      source_bot_version = "DRAFT"
    }
  }

  # Ensure intents are created before versioning
  depends_on = [
    aws_lexv2models_intent.asset_status,
    aws_lexv2models_intent.fleet_overview,
    aws_lexv2models_intent.explain_risk,
    aws_lexv2models_intent.recommend_action,
    aws_lexv2models_intent.acknowledge_incident
  ]
}

# The AWS provider currently lacks native support for managing Lex V2 Bot Aliases easily
# using standard terraform resources without complex CLI interactions. The AWS provider
# currently documents `aws_lexv2models_bot` but lacks a complete V2 implementation for
# bot aliases that includes code hook bindings natively inside TF.
# As requested, we configure the base bot resources, allowing the user/console to finalize
# adding the specific lambda alias if native v2 terraform resources are unavailable.

output "bot_id" {
  value = var.enable_lex ? aws_lexv2models_bot.copilot[0].id : null
}
output "bot_alias_id" {
  value = null
}
