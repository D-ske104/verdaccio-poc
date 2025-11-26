import type { Request, Response, NextFunction, Application } from 'express';
import { Config, IPluginMiddleware, IStorageManager } from '@verdaccio/types';

interface PluginConfig extends Config {
  limit_days?: number;
}

// v6用の型定義パッチ
interface StorageV6 {
  getPackage(options: { name: string; req?: Request }): Promise<any>;
}

export default class SoftBlockerPlugin implements IPluginMiddleware<PluginConfig> {
  private config: PluginConfig;

  constructor(config: PluginConfig, options: any) {
    this.config = config;
  }

  public register_middlewares(
    app: Application, 
    auth: any, 
    storage: IStorageManager<PluginConfig>
  ): void {
    
    app.get('/:package', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const packageName = req.params.package;

      if (packageName.startsWith('-') || packageName === 'favicon.ico') {
        return next();
      }

      try {
        const v6Storage = storage as unknown as StorageV6;
        
        // メタデータ取得
        const originalInfo = await v6Storage.getPackage({ name: packageName, req });
        
        // ディープコピー (キャッシュ汚染防止)
        const info = JSON.parse(JSON.stringify(originalInfo));

        if (!info['dist-tags'] || !info.time) {
          res.json(info); return;
        }

        const now = Date.now();
        const limitDays = this.config.limit_days ?? 3;
        const limitMs = limitDays * 24 * 60 * 60 * 1000;

        // 現在の latest バージョン
        const originalLatestVersion = info['dist-tags'].latest;
        const latestPublishTimeStr = info.time[originalLatestVersion];

        // もし「現在のlatest」がすでに安全なら、何も加工せずそのまま返す
        // (毎回全バージョン走査するのは重いので、ここでの早期リターンは重要)
        if (latestPublishTimeStr) {
            const latestPublishTime = new Date(latestPublishTimeStr).getTime();
            if ((now - latestPublishTime) >= limitMs) {
                // 安全なのでそのまま返す
                res.json(info);
                return;
            }
        }

        // ここに来たということは、originalLatestVersion は「まだ新しすぎる」
        // -> 安全なバージョンの中で一番新しいものを探す旅に出る

        let safeLatestVersion = '';
        let maxSafeTime = 0;

        // 全バージョンをチェック
        for (const [ver, timeStr] of Object.entries(info.time)) {
          if (ver === 'created' || ver === 'modified') continue;

          const publishTime = new Date(timeStr as string).getTime();
          
          // ★変更点: ここで unsafe なバージョンを delete しない！
          
          // 安全基準を満たしているかチェック
          if ((now - publishTime) >= limitMs) {
            // 安全なものの中で一番新しい時間を探す
            if (publishTime > maxSafeTime) {
              maxSafeTime = publishTime;
              safeLatestVersion = ver;
            }
          }
        }

        // もし安全なバージョンが見つかったら、latest を張り替える
        if (safeLatestVersion) {
            // 1. latest を「安全な最新版」に向ける
            info['dist-tags'].latest = safeLatestVersion;

            // 2. (任意) 本当の最新版には別のタグを付けてあげる
            // これで npm dist-tag ls した時に `quarantined: 2.0.0` みたいに見える
            info['dist-tags'].quarantined = originalLatestVersion;
        } else {
            // 安全なバージョンが1つもない（全部3日以内）の場合
            // 仕方ないので dist-tags.latest を消すか、404にする
            // ここでは「latestタグを消す」挙動にする（インストールしようとするとエラーになる）
            delete info['dist-tags'].latest;
        }

        // 加工したJSONを返す
        res.json(info);
        return;

      } catch (err) {
        next();
      }
    });
  }
}
