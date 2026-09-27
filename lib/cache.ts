export interface CacheSource {
    id: number;
    source: string;
    title: string;
    section: string;
    chunkIndex: number;
    rrfScore: number;
    rerankScore: number | null;
  }
  
  export interface CacheCitationValidation {
    status: "valid" | "missing" | "invalid";
    citationCount: number;
    citedSourceIds: number[];
    invalidSourceIds: number[];
  }
  
  export interface CacheEntry {
    answer: string;
    sources: CacheSource[];
    citationValidation: CacheCitationValidation;
    createdAt: number;
  }
  
  const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
  
  const cache = new Map<string, CacheEntry>();
  
  /**
   * 写入 Cache
   */
  export function setCache(
    key: string,
    value: Omit<CacheEntry, "createdAt">
  ) {
    cache.set(key, {
      ...value,
      createdAt: Date.now(),
    });
  }
  
  /**
   * 读取 Cache
   *
   * 返回：
   * - CacheEntry：命中
   * - null：未命中 / 已过期
   */
  export function getCache(
    key: string
  ): CacheEntry | null {
    const entry = cache.get(key);
  
    // Cache Miss
    if (!entry) {
      return null;
    }
  
    const now = Date.now();
  
    // TTL expired
    if (
      now - entry.createdAt >
      CACHE_TTL_MS
    ) {
      cache.delete(key);
  
      return null;
    }
  
    // Cache Hit
    return entry;
  }
  
  /**
   * 删除指定 Cache
   */
  export function deleteCache(key: string) {
    cache.delete(key);
  }
  
  /**
   * 清空所有 Cache
   */
  export function clearCache() {
    cache.clear();
  }
  
  /**
   * 获取当前 Cache 数量
   *
   * 主要用于开发和测试。
   */
  export function getCacheSize() {
    return cache.size;
  }