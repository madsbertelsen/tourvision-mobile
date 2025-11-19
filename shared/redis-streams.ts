import { createClient, RedisClientType } from 'redis';

export interface PunctuationEvent {
  type: 'punctuation_detected';
  documentId: string;
  character: string;
  timestamp: number;
}

export class RedisStreamsClient {
  private client: RedisClientType;
  private consumerGroup = 'agent-managers';
  private punctuationStream = 'punctuation:events';

  constructor(redisUrl: string) {
    this.client = createClient({ url: redisUrl });

    this.client.on('error', (err) => {
      console.error('[Redis] Connection error:', err);
    });
  }

  async connect() {
    await this.client.connect();
    console.log('[Redis] Connected successfully');

    // Create consumer group if it doesn't exist
    try {
      await this.client.xGroupCreate(this.punctuationStream, this.consumerGroup, '0', {
        MKSTREAM: true
      });
      console.log(`[Redis] Created consumer group: ${this.consumerGroup}`);
    } catch (err: any) {
      if (err.message.includes('BUSYGROUP')) {
        console.log(`[Redis] Consumer group already exists: ${this.consumerGroup}`);
      } else {
        throw err;
      }
    }
  }

  async publishPunctuationEvent(event: PunctuationEvent) {
    await this.client.xAdd(this.punctuationStream, '*', event as any);
  }

  async consumePunctuationEvents(
    consumerId: string,
    handler: (event: PunctuationEvent) => void
  ): Promise<() => void> {
    let running = true;

    const consume = async () => {
      while (running) {
        try {
          // Read new messages from the stream
          const messages = await this.client.xReadGroup(
            this.consumerGroup,
            consumerId,
            [
              {
                key: this.punctuationStream,
                id: '>' // Only new messages
              }
            ],
            {
              COUNT: 10,
              BLOCK: 5000 // Block for 5 seconds waiting for new messages
            }
          );

          if (messages) {
            for (const stream of messages) {
              for (const message of stream.messages) {
                const event = message.message as unknown as PunctuationEvent;

                // Call the handler
                handler(event);

                // Acknowledge the message
                await this.client.xAck(this.punctuationStream, this.consumerGroup, message.id);
              }
            }
          }
        } catch (err) {
          if (running) {
            console.error('[Redis] Error consuming messages:', err);
            // Wait a bit before retrying
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }
    };

    // Start consuming in background
    consume();

    // Return unsubscribe function
    return () => {
      running = false;
    };
  }

  async disconnect() {
    await this.client.quit();
    console.log('[Redis] Disconnected');
  }
}
