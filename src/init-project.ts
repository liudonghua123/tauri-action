import { writeFileSync } from 'fs';
import { join } from 'path';

import { getConfig } from './config';
import { Runner } from './runner';
import { getPackageJson, getTauriDir } from './utils';

import type { Application, BuildOptions, Info } from './types';

export async function initProject(
  root: string,
  runner: Runner,
  info: Info,
  { iconPath, bundleIdentifier }: BuildOptions
): Promise<Application> {
  console.info(`run tauri init`);
  await runner.execTauriCommand(
    ['init'],
    ['--ci', '--app-name', info.name],
    root
  );

  const packageJson = getPackageJson(root);
  const tauriPath = getTauriDir(root);
  console.info(`packageJson: ${JSON.stringify(packageJson)}, tauriPath: ${tauriPath}`);

  if (tauriPath === null) {
    console.error('Failed to resolve Tauri path');
    process.exit(1);
  }
  const configPath = join(tauriPath, 'tauri.conf.json');
  const config = getConfig(tauriPath);
  console.info(`configPath: ${configPath}, config: ${JSON.stringify(config)}`);

  console.log(
    `Replacing tauri.conf.json config - package.version=${info.version}`
  );
  const pkgConfig = {
    ...config.package,
    version: info.version,
  };
  if (packageJson?.productName) {
    console.log(
      `Replacing tauri.conf.json config - package.productName=${packageJson.productName}`
    );
    pkgConfig.productName = packageJson.productName;
  }
  config.package = pkgConfig;

  if (bundleIdentifier) {
    console.log(
      `Replacing tauri.conf.json config - tauri.bundle.identifier=${bundleIdentifier}`
    );
    config.tauri = {
      ...config.tauri,
      bundle: {
        ...config.tauri?.bundle,
        identifier: bundleIdentifier,
      },
    };
  }

  writeFileSync(configPath, JSON.stringify(config, null, 2));

  const app = {
    tauriPath,
    runner,
    name: info.name,
    version: info.version,
    wixLanguage: info.wixLanguage,
  };

  if (iconPath) {
    await runner.execTauriCommand(['icon', join(root, iconPath)], [], root);
  }

  return app;
}
