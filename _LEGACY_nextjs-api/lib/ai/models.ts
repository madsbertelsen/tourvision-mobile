export const DEFAULT_CHAT_MODEL: string = 'chat-model';

export interface ChatModel {
  id: string;
  name: string;
  description: string;
}

export const chatModels: Array<ChatModel> = [
  {
    id: 'chat-model',
    name: 'Mistral Small',
    description: 'Fast and efficient model for general conversations',
  },
  {
    id: 'chat-model-reasoning',
    name: 'Mistral Small (Reasoning)',
    description: 'Uses chain-of-thought reasoning for complex problems',
  },
];
