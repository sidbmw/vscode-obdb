import * as crypto from 'crypto';
import { Command, CacheEntry } from '../types';

// In-memory store for cached images
const imageCache: { [key: string]: CacheEntry } = {};

/**
 * Retrieves a cached bitmap visualization for a command if available
 * @param command The command object to get cached image for
 * @returns The cached image data URL or null if not found/expired
 */
export function getCachedImage(command: Command): string | null {
  // Create a hash of the command object to use as a cache key
  const commandStr = JSON.stringify(command);
  const hash = crypto.createHash('md5').update(commandStr).digest('hex');

  const cached = imageCache[hash];
  if (cached && (Date.now() - cached.timestamp < 1000 * 60 * 10)) { // 10 minute cache
    return cached.image;
  }

  return null;
}

/**
 * Stores a bitmap visualization in the cache
 * @param command The command object to use as the cache key
 * @param imageData The image data URL to cache
 */
export function cacheImage(command: Command, imageData: string): void {
  const commandStr = JSON.stringify(command);
  const hash = crypto.createHash('md5').update(commandStr).digest('hex');

  imageCache[hash] = {
    image: imageData,
    timestamp: Date.now()
  };
}