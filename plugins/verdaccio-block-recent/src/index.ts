import { 
  Config, 
  IPluginMiddleware, 
  IStorageManager 
} from '@verdaccio/types';
import type { Request, Response, NextFunction, Application } from 'express';

// 設定ファイル(config.yaml)から受け取るオプションの型定義
// もし config.yaml に `limit_days: 5` とか書くならここで定義できます
interface PluginConfig extends Config {
  limit_days?: number;
}

export default class BlockRecentPlugin implements IPluginMiddleware<PluginConfig> {
  private config: PluginConfig;

  constructor(config: PluginConfig, options: any) {
    this.config = config;
  }

  // 必ず実装しなければならないメソッド
  public register_middlewares(
    app: Application, 
    auth: any, 
    storage: IStorageManager<PluginConfig>
  ): void {
    
    // Verdaccio v6 の storage API はコールバック仕様。Promise/awaitではなくcallbackを使う。
    app.get('/:package/:version?', (req: Request, res: Response, next: NextFunction) => {
      const packageName = req.params.package;

      // システム系やScopeなしを除外
      if (packageName.startsWith('-')) return next();

      // Verdaccio v6のstorage.getPackageは options({name, req, callback}) を受け取る
      storage.getPackage({
        name: packageName,
        req,
        callback: (err: any, info: any) => {
        if (err || !info) {
          // uplink未取得などは素通し
          return next();
        }

        const latestVersion = info['dist-tags']?.latest;
        if (!latestVersion || !info.time) return next();

        const publishTime = new Date(info.time[latestVersion]).getTime();
        if (Number.isNaN(publishTime)) return next();

        const now = Date.now();
        const limitDays = this.config.limit_days ?? 3;
        const limitMs = limitDays * 24 * 60 * 60 * 1000;

        if ((now - publishTime) < limitMs) {
          const hoursOld = Math.floor((now - publishTime) / 3600000);
          console.log(`[Blocker] ⛔ ${packageName} is too new (${hoursOld}h)`);
          res.status(403).send(
            `Package "${packageName}" is blocked. It was published ${hoursOld} hours ago (Policy: > ${limitDays} days).`
          );
          return;
        }

        console.log(`[Blocker] ✅ ${packageName} is safe`);
        next();
        }
      });
    });
  }
}
