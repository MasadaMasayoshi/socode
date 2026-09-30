'use strict';
// 自動テスト用の小さな模擬MongoDB（server.js が使う操作だけ）。同じ接続先（URI）なら、別々に読み込んだ
// server.js（＝ローカル版と公開版の2つのサーバー）が同じデータを共有する。
const stores = global.__FAKE_MONGO_STORES__ || (global.__FAKE_MONGO_STORES__ = new Map());
const clone = v => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
function matches(doc, filter) {
  return Object.entries(filter || {}).every(([k, cond]) => {
    const v = doc[k];
    if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
      if ('$in' in cond) return cond.$in.includes(v);
      if ('$ne' in cond) return v !== cond.$ne;
    }
    return v === cond;
  });
}
class Collection {
  constructor(map) { this.map = map; }
  find(filter) { const list = [...this.map.values()].filter(d => matches(d, filter)).map(clone); return { toArray: async () => list }; }
  async findOne(filter) { const d = [...this.map.values()].find(x => matches(x, filter)); return d ? clone(d) : null; }
  async insertOne(doc) {
    if (this.map.has(doc._id)) { const e = new Error('E11000 duplicate key'); e.code = 11000; throw e; }
    this.map.set(doc._id, clone(doc));
    return { insertedId: doc._id };
  }
  async updateOne(filter, update, opts = {}) {
    let doc = [...this.map.values()].find(x => matches(x, filter));
    let upserted = false;
    if (!doc) {
      if (!opts.upsert) return { matchedCount: 0, modifiedCount: 0 };
      doc = {};
      Object.entries(filter).forEach(([k, v]) => { if (!v || typeof v !== 'object') doc[k] = v; });
      upserted = true;
    }
    Object.entries(update.$set || {}).forEach(([k, v]) => { doc[k] = clone(v); });
    Object.entries(update.$inc || {}).forEach(([k, v]) => { doc[k] = (doc[k] || 0) + v; });
    this.map.set(doc._id, doc);
    return { matchedCount: upserted ? 0 : 1, modifiedCount: 1, upsertedCount: upserted ? 1 : 0 };
  }
}
class MongoClient {
  constructor(uri) { this.uri = uri; }
  async connect() { if (!stores.has(this.uri)) stores.set(this.uri, new Map()); }
  db(name) {
    const dbs = stores.get(this.uri);
    if (!dbs.has(name)) dbs.set(name, new Map());
    const cols = dbs.get(name);
    return { collection: c => { if (!cols.has(c)) cols.set(c, new Map()); return new Collection(cols.get(c)); } };
  }
}
module.exports = { MongoClient, __stores: stores };
