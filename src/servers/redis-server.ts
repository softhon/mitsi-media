import { createClient, RedisClientType, SetOptions } from 'redis';

import { Actions as PSA } from '../types/actions';
import config from '../config';

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
      await this.subscribe(PSA.Message);
      console.log('redis connected');
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async subscribe(channel: string): Promise<void> {
    if (!this.isConnected)
      throw new Error('Redis clients are not connected. Call connect() first');
    await this.subClient.subscribe(channel, message => {
      const {
        action,
        args,
      }: {
        action: PSA;
        args: { [key: string]: unknown };
      } = JSON.parse(message);

      const handler = this.pubSubHander[action];

      if (handler) handler(args);
    });
    console.log(`Subscribed to channel "${channel}"`);
  }

  async publish({
    channel,
    action,
    args,
  }: {
    channel: string;
    action: PSA;
    args: { [key: string]: unknown };
  }): Promise<void> {
    if (!this.isConnected)
      throw new Error('Redis clients are not connected. Call connect() first');

    const message = JSON.stringify({ action, args });
    await this.pubClient.publish(channel, message);
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

  async scan(
    cursor: number | string,
    options: {
      MATCH: string;
      COUNT: number;
    }
  ): Promise<{
    cursor: string;
    keys: string[];
  }> {
    const stringCursor =
      typeof cursor === 'number' ? cursor.toString() : cursor;

    return await this.pubClient.scan(stringCursor, options);
  }

  async exists(key: string): Promise<number> {
    return await this.pubClient.exists(key);
  }

  async hSet(
    key: string,
    fieldOrValue: string | Record<string, string | number>,
    value?: string | number
  ): Promise<number> {
    if (typeof fieldOrValue === 'string') {
      if (value === undefined) {
        throw new Error('Value must be provided when field is a string');
      }
      return await this.pubClient.hSet(key, fieldOrValue, value);
    }

    if (typeof fieldOrValue === 'object') {
      return await this.pubClient.hSet(key, fieldOrValue);
    }
    throw new Error('Invalid arguments for hSet');
  }

  async hGet(key: string, field: string): Promise<string | null> {
    return await this.pubClient.hGet(key, field);
  }

  async hDel(key: string, field: string): Promise<number> {
    return await this.pubClient.hDel(key, field);
  }

  async hGetAll(key: string): Promise<{ [key: string]: string | number }> {
    return await this.pubClient.hGetAll(key);
  }

  async hkeys(key: string): Promise<string[]> {
    return await this.pubClient.hKeys(key);
  }

  async hVals(key: string): Promise<string[]> {
    return await this.pubClient.hVals(key);
  }

  async hLen(key: string): Promise<number> {
    return await this.pubClient.hLen(key);
  }

  async del(key: string): Promise<number> {
    return await this.pubClient.del(key);
  }

  async expire(key: string, seconds: number): Promise<number> {
    return await this.pubClient.expire(key, seconds);
  }

  async hExpire(
    key: string,
    fields: string[],
    seconds: number,
    mode?: 'NX' | 'XX' | 'GT' | 'LT' | undefined
  ): Promise<number[]> {
    return await this.pubClient.hExpire(key, fields, seconds, mode);
  }

  async persist(key: string): Promise<number> {
    return await this.pubClient.persist(key);
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

  private pubSubHander: {
    [key in PSA]?: (args: { [key: string]: unknown }) => void;
  } = {
    [PSA.RemovePeer]: args => {
      console.log(args);
    },
  };
}

export default RedisServer;
