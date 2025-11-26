import type { Request, Response, NextFunction, Application } from 'express';
import { Config, IPluginMiddleware, IStorageManager } from '@verdaccio/types';

interface PluginConfig extends Config {
  limit_days?: number;
}

export default class SoftBlockerPlugin implements IPluginMiddleware<PluginConfig> {
  private config: PluginConfig;

  constructor(config: PluginConfig, _options: any) {
    this.config = config;
  }

  public register_middlewares(
    app: Application,
    _auth: any,
    storage: IStorageManager<PluginConfig>
  ): void {

    app.get('/:package', (req: Request, res: Response, next: NextFunction): void => {
      const packageName = req.params.package;
      if (packageName.startsWith('-') || packageName === 'favicon.ico') {
        return next();
      }

      storage.getPackage({
        name: packageName,
        req,
        callback: (err: any, originalInfo: any) => {
          if (err || !originalInfo) {
            return next();
          }

          // キャッシュ汚染防止のためディープコピー
            const info = JSON.parse(JSON.stringify(originalInfo));
          if (!info['dist-tags'] || !info.time) {
            res.json(info);
            return;
          }

          const now = Date.now();
          const limitDays = this.config.limit_days ?? 3;
          const limitMs = limitDays * 24 * 60 * 60 * 1000;

          const originalLatestVersion = info['dist-tags'].latest;
          const latestPublishTimeStr = info.time[originalLatestVersion];
          if (latestPublishTimeStr) {
            const latestPublishTime = new Date(latestPublishTimeStr).getTime();
            if ((now - latestPublishTime) >= limitMs) {
              // 既に安全
              res.json(info);
              return;
            }
          }

          let safeLatestVersion = '';
          let maxSafeTime = 0;
          for (const [ver, timeStr] of Object.entries(info.time)) {
            if (ver === 'created' || ver === 'modified') continue;
            const publishTime = new Date(timeStr as string).getTime();
            if ((now - publishTime) >= limitMs) {
              if (publishTime > maxSafeTime) {
                maxSafeTime = publishTime;
                safeLatestVersion = ver;
              }
            }
          }

          if (safeLatestVersion) {
            info['dist-tags'].latest = safeLatestVersion;
            info['dist-tags'].quarantined = originalLatestVersion;
          } else {
            delete info['dist-tags'].latest;
          }

          res.json(info);
        }
      });
    });
  }
}
