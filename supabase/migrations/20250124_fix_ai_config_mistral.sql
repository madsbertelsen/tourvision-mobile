-- Fix model_provider constraint to include mistral
ALTER TABLE public.ai_agent_config
DROP CONSTRAINT IF EXISTS ai_agent_config_model_provider_check;

ALTER TABLE public.ai_agent_config
ADD CONSTRAINT ai_agent_config_model_provider_check
CHECK (model_provider IN ('openai', 'anthropic', 'mistral'));

-- Update any existing config with invalid values to use mistral
UPDATE public.ai_agent_config
SET model_provider = 'mistral'
WHERE model_provider NOT IN ('openai', 'anthropic', 'mistral');