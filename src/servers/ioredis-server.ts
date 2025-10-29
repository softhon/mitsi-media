import Redis from 'ioredis';

import { Actions as PSA } from '../types/actions';

class IORedisServer {
  private static instance: IORedisServer | null = null;
  private pubClient: Redis;
  private subClient: Redis;

  private isConnected: boolean = false;

  private constructor() {
    this.pubClient = new Redis();
    this.subClient = this.pubClient.duplicate();
  }

  static getInstance(): IORedisServer {
    if (!IORedisServer.instance) {
      IORedisServer.instance = new IORedisServer();
    }
    return IORedisServer.instance;
  }

  async connect(): Promise<void> {
    if (this.isConnected) {
      console.log('Redis clients already connected');
      return;
    }
    try {
      await Promise.all([this.pubClient.ping(), this.subClient.ping()]);
      this.isConnected = true;
      await this.subscribe(PSA.Message);
      console.log('ioredis connected');
    } catch (error) {
      console.error(error);
      throw error;
    }
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
    console.info(`Message published to channel ${message}`);
  }

  getPubClient(): Redis {
    return this.pubClient;
  }

  getSubClient(): Redis {
    return this.subClient;
  }

  async subscribe(channel: string): Promise<void> {
    if (!this.isConnected)
      throw new Error('Redis clients are not connected. Call connect() first');
    console.log(`Subscribing to channel "${channel}"`);

    await this.subClient.subscribe(channel, (err, count) => {
      if (err) {
        console.error('Failed to subscribe:', err);
      } else {
        console.log(`Subscribed to ${count} channel(s)`);
      }
    });

    this.subClient.on('message', (channel, message) => {
      const {
        action,
        args,
      }: {
        action: PSA;
        args: { [key: string]: unknown };
      } = JSON.parse(message);
      console.log(
        `got pubsub event from channel -> ${channel} message -> ${message}`
      );

      const handler = this.pubSubHander[action];

      if (handler) handler(args);
    });

    console.log(`Subscribed to channel "${channel}"`);
  }

  async unsubscribe(channel: string): Promise<void> {
    if (!this.isConnected)
      throw new Error('Redis clients are not connected. Call connect() first');

    await this.subClient.unsubscribe(channel);
    console.log(`Unsubscribed from channel "${channel}"`);
  }

  // Set operations

  async set(key: string, value: string | number): Promise<string> {
    return await this.pubClient.set(key, value);
  }

  async setex(key: string, value: string, seconds: number): Promise<string> {
    return await this.pubClient.setex(key, value, seconds);
  }

  async setnx(key: string, value: string): Promise<number> {
    return await this.pubClient.setnx(key, value);
  }

  async get(key: string): Promise<string | null> {
    return await this.pubClient.get(key);
  }

  async sAdd(key: string, member: string): Promise<number> {
    return await this.pubClient.sadd(key, member);
  }

  async sRem(key: string, member: string): Promise<number> {
    return await this.pubClient.srem(key, member);
  }

  async sIsMember(key: string, member: string): Promise<number> {
    return await this.pubClient.sismember(key, member);
  }

  async sMembers(key: string): Promise<string[]> {
    return await this.pubClient.smembers(key);
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

    const [nextCursor, keys] = await this.pubClient.scan(
      stringCursor,
      'MATCH',
      options.MATCH,
      'COUNT',
      options.COUNT
    );

    return {
      cursor: nextCursor,
      keys: keys,
    };
  }

  async exists(key: string): Promise<number> {
    return await this.pubClient.exists(key);
  }

  // Hash operations

  async hSet(
    key: string,
    fieldOrValue: string | Record<string, string | number>,
    value?: string | number
  ): Promise<number> {
    if (typeof fieldOrValue === 'string') {
      if (value === undefined) {
        throw new Error('Value must be provided when field is a string');
      }
      return await this.pubClient.hset(key, fieldOrValue, value);
    }

    if (typeof fieldOrValue === 'object') {
      return await this.pubClient.hset(key, fieldOrValue);
    }
    throw new Error('Invalid arguments for hSet');
  }

  async hGet(key: string, field: string): Promise<string | null> {
    return await this.pubClient.hget(key, field);
  }

  async hDel(key: string, field: string): Promise<number> {
    return await this.pubClient.hdel(key, field);
  }

  async hGetAll(key: string): Promise<{ [key: string]: string }> {
    return await this.pubClient.hgetall(key);
  }

  async hkeys(key: string): Promise<string[]> {
    return await this.pubClient.hkeys(key);
  }

  async hVals(key: string): Promise<string[]> {
    return await this.pubClient.hvals(key);
  }

  async hLen(key: string): Promise<number> {
    return await this.pubClient.hlen(key);
  }

  async del(key: string): Promise<number> {
    return await this.pubClient.del(key);
  }

  async expire(key: string, seconds: number): Promise<number> {
    return await this.pubClient.expire(key, seconds);
  }

  // async hExpire(
  //   key: string,
  //   fields: string[],
  //   seconds: number,
  //   mode?: 'NX' | 'XX' | 'GT' | 'LT' | undefined
  // ): Promise<number[]> {
  //   const args: any[] = [key, seconds, ...fields];
  //   if (mode) {
  //     args.push(mode);
  //   }
  //   return await this.pubClient.hexpire(...args);
  // }

  async persist(key: string): Promise<number> {
    return await this.pubClient.persist(key);
  }

  async disconnect(): Promise<void> {
    if (this.isConnected) {
      await Promise.all([this.pubClient.quit(), this.subClient.quit()]);
      IORedisServer.instance = null;
      this.isConnected = false;
      console.log('Redis clients disconnected');
    }
  }

  private pubSubHander: {
    [key in PSA]?: (args: { [key: string]: unknown }) => void;
  } = {
    [PSA.RemovePeer]: args => {
      console.log(args);
    },
  };
}

export const ioRedisServer = IORedisServer.getInstance();
