import { createClient, RedisClientType, SetOptions } from 'redis';

import { PubSubEvents } from '../types/events';
import config from '../config/config';

class RedisServer {
  private static instance: RedisServer | null = null;
  private pubClient: RedisClientType;
  private subClient: RedisClientType;
  private isConnected: boolean = false;

  private constructor() {
    this.pubClient = createClient({ url: config.redisServerUrl });
    this.subClient = this.pubClient.duplicate();
  }

  static getInstance(): RedisServer {
    if (!RedisServer.instance) {
      RedisServer.instance = new RedisServer();
    }
    return RedisServer.instance;
  }

  async connect(): Promise<void> {
    if (this.isConnected) {
      console.log('Redis clients already connected');
      return;
    }
    try {
      await Promise.all([this.pubClient.connect(), this.subClient.connect()]);
      this.isConnected = true;
      await this.subscribe();
      console.log('redis connected');
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  private async subscribe(): Promise<void> {
    if (!this.isConnected)
      throw new Error('Redis clients are not connected. Call connect() first');
    await this.subClient.subscribe(PubSubEvents.Message, message => {
      const {
        event,
        args,
      }: {
        event: PubSubEvents;
        args: { [key: string]: unknown };
      } = JSON.parse(message);

      console.log(event, args);

      // const handler = PubSubHandler[event];

      // handler && handler(args);
    });
  }

  async publish({
    event,
    args,
  }: {
    event: PubSubEvents;
    args: { [key: string]: unknown };
  }): Promise<void> {
    if (!this.isConnected)
      throw new Error('Redis clients are not connected. Call connect() first');

    const message = JSON.stringify({ event, args });
    await this.pubClient.publish(PubSubEvents.Message, message);
    console.info(`Message published to channe ${message}`);
  }

  getPubClient(): RedisClientType {
    return this.pubClient;
  }
  getSubClient(): RedisClientType {
    return this.subClient;
  }

  async get(key: string): Promise<string | null> {
    return await this.pubClient.get(key);
  }

  async set(
    key: string,
    value: string,
    option?: SetOptions
  ): Promise<string | null> {
    return await this.pubClient.set(key, value, option);
  }

  async sAdd(key: string, member: string): Promise<number> {
    return await this.pubClient.sAdd(key, member);
  }

  async sRem(key: string, member: string): Promise<number> {
    return await this.pubClient.sRem(key, member);
  }

  async sIsMember(key: string, member: string): Promise<number> {
    return await this.pubClient.sIsMember(key, member);
  }

  async sMembers(key: string): Promise<string[]> {
    return await this.pubClient.sMembers(key);
  }

  async disconnect(): Promise<void> {
    if (this.isConnected) {
      await Promise.all([this.pubClient.quit(), this.subClient.quit()]);
      RedisServer.instance = null;
      this.isConnected = false;
      console.log('Redis clients disconnected');
    }
  }

  async unsubscribe(channel: string): Promise<void> {
    if (!this.isConnected)
      throw new Error('Redis clients are not connected. Call connect() first');

    await this.subClient.unsubscribe(channel);
    console.log(`Unsubscribed from channel "${channel}"`);
  }
}

export const redisServer = RedisServer.getInstance();
