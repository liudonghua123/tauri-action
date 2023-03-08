import { platform } from 'os'
import * as core from '@actions/core'
import { join, resolve, dirname, basename } from 'path'
import { existsSync } from 'fs'
import uploadReleaseAssets from './upload-release-assets'
import createRelease from './create-release'
import { getPackageJson, buildProject, getInfo, execCommand } from '@liudonghua123/action-core'
import type { BuildOptions } from '@liudonghua123/action-core'
import stringArgv from 'string-argv'

async function run(): Promise<void> {
  try {
    const projectPath = resolve(
      process.cwd(),
      core.getInput('projectPath') || process.argv[2]
    )
    const configPath = join(
      projectPath,
      core.getInput('configPath') || 'tauri.conf.json'
    )
    const distPath = core.getInput('distPath')
    const iconPath = core.getInput('iconPath')
    const includeDebug = core.getBooleanInput('includeDebug')
    const tauriScript = core.getInput('tauriScript')
    const args = stringArgv(core.getInput('args'))
    const bundleIdentifier = core.getInput('bundleIdentifier')
    const target = core.getInput('target')

    let tagName = core.getInput('tagName').replace('refs/tags/', '')
    let releaseName = core.getInput('releaseName').replace('refs/tags/', '')
    let body = core.getInput('releaseBody')
    const draft = core.getBooleanInput('releaseDraft')
    const prerelease = core.getBooleanInput('prerelease')
    const commitish = core.getInput('releaseCommitish') || null

    if (Boolean(tagName) !== Boolean(releaseName)) {
      throw new Error(
        '`tag` is required along with `releaseName` when creating a release.'
      )
    }

    const options: BuildOptions = {
      configPath: existsSync(configPath) ? configPath : null,
      distPath,
      iconPath,
      tauriScript,
      args,
      bundleIdentifier,
      target,
    }
    const info = getInfo(projectPath)
    const artifacts = await buildProject(projectPath, false, options)
    if (includeDebug) {
      const debugArtifacts = await buildProject(projectPath, true, options)
      artifacts.push(...debugArtifacts)
    }

    if (artifacts.length === 0) {
      throw new Error('No artifacts were found.')
    }

    console.log(`Artifacts: ${artifacts}.`)

    let releaseId: number
    if (tagName) {
      const packageJson = getPackageJson(projectPath)
      const templates = [
        {
          key: '__VERSION__',
          value: info.version
        }
      ]

      templates.forEach(template => {
        const regex = new RegExp(template.key, 'g')
        tagName = tagName.replace(regex, template.value)
        releaseName = releaseName.replace(regex, template.value)
        body = body.replace(regex, template.value)
      })

      const releaseData = await createRelease(
        tagName,
        releaseName,
        body,
        commitish || undefined,
        draft,
        prerelease
      )
      releaseId = releaseData.id
      core.setOutput('releaseUploadUrl', releaseData.uploadUrl)
      core.setOutput('releaseId', releaseData.id.toString())
      core.setOutput('releaseHtmlUrl', releaseData.htmlUrl)
    } else {
      releaseId = Number(core.getInput('releaseId') || 0)
    }

    if (releaseId) {
      if (platform() === 'darwin') {
        let i = 0
        for (const artifact of artifacts) {
          // updater provide a .tar.gz, this will prevent duplicate and overwriting of
          // signed archive
          if (artifact.endsWith('.app')) {
            const target_arch = target?.split('-')[0] || 'x86_64'
            let arch = 
              target_arch === 'x86_64'
                ? 'x64'
                : target_arch === 'i686'
                 ? 'x86'
                 : target_arch
            const artifactName = `${info.name}_${info.version}_${arch}_macos.app.tar.gz`
            await execCommand('tar', ['czf', artifactName, '-C', dirname(artifact), basename(artifact)])
            artifacts[i] = artifactName
          }
          i++
        }
      }
      await uploadReleaseAssets(releaseId, artifacts)
    }
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
